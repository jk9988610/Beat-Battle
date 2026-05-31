import { CRITERIA, CRITERIA_IDS, averageScores } from './scoring.js';
import { loadVersionMeta, formatVersionLabel, initUpdateUI, syncVersionLabels } from './version.js';
import { copyDebugInfo } from './debug.js';
import {
  isAdmin,
  tryElevateWithPin,
  revokeAdminSession,
  assertAdmin,
  getAdminHint,
  isAdminByName,
  grantAdminSessionIfEligible,
} from './admin.js';
import { renderSettingsPage, bindSettingsPageEvents } from './settings-page.js';
import {
  loadState,
  saveState,
  getCurrentSeason,
  ensureSeason,
  generateId,
  saveAudioBlob,
  getAudioBlob,
  exportSeasonData,
  importSeasonData,
} from './storage.js';
import { isCloudEnabled, getCloudConfig, setCloudConfig, hasBuiltInCloudConfig } from './config.js';
import { saveSession, clearSession, loadSession, MUSIC_PROD_URL } from './session.js';
import {
  listPublishedWorks,
  createSubmissionFromPublished,
  resolveWorkPreviewUrl,
  revokeWorkPreviewUrl,
} from './published-works.js';
import {
  normalizeSeason,
  formatSeasonProgressHtml,
  getSeasonRules,
  setDefaultSeasonRulesTemplate,
} from './season-rules.js';
import {
  maybeAutoProgressSeason,
  saveSeasonParticipant,
  saveSeasonRules,
} from './season-progress.js';
import {
  cloudActive,
  initCloud,
  findOrCreateUser,
  createSubmission,
  createReview,
  updateSeasonPhase,
  startNewSeason,
  updateSeasonRulesRemote,
  joinSeasonParticipantRemote,
  subscribeSeasonChanges,
  setCurrentUserId,
} from './remote.js';

let state = null;
let audioObjectUrl = null;
let reloadTimer = null;
let uploadMode = 'library';
let publishedWorksCache = [];
let autoProgressTimer = null;

const $ = (sel) => document.querySelector(sel);

function normalizeAllSeasons() {
  if (!state?.seasons) return;
  for (const s of Object.values(state.seasons)) normalizeSeason(s);
}

function syncGlobalPhase() {
  const season = getCurrentSeason(state);
  state.phase = season.phase;
}

function persistStateOnly() {
  syncGlobalPhase();
  saveState(state);
}

function persist() {
  persistStateOnly();
  render();
  scheduleAutoProgress();
}

async function reloadFromCloud() {
  if (!isCloudEnabled()) return;
  state = await loadState();
  normalizeAllSeasons();
  await runAutoProgress();
  render();
  scheduleAutoProgress();
}

function scheduleCloudReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => reloadFromCloud(), 400);
}

async function runAutoProgress() {
  if (!state) return { changed: false };
  const season = getCurrentSeason(state);
  normalizeSeason(season);
  const result = await maybeAutoProgressSeason(state, { saveState: persistStateOnly });
  if (result.changed) {
    if (cloudActive()) await reloadFromCloud();
    else persistStateOnly();
    if (result.message) alert(result.message);
  }
  return result;
}

function scheduleAutoProgress(delayMs = 300) {
  clearTimeout(autoProgressTimer);
  autoProgressTimer = setTimeout(async () => {
    try {
      const result = await runAutoProgress();
      if (result.changed) render();
      const season = getCurrentSeason(state);
      const rules = getSeasonRules(season);
      if (rules.autoProgress) scheduleAutoProgress(season.phase === 'revealed' ? 5000 : 8000);
    } catch (err) {
      console.error('auto progress', err);
    }
  }, delayMs);
}

function currentUser() {
  return state?.currentUserId ? state.users[state.currentUserId] : null;
}

function setHash(route) {
  const path = route.startsWith('#') ? route.slice(1) : route;
  if (location.hash.replace(/^#/, '') === path) {
    render();
  } else {
    location.hash = path;
  }
}

function getRoute() {
  const raw = (location.hash || '#home').replace(/^#/, '');
  const segment = raw.split('?')[0];
  const parts = segment.split('/').filter(Boolean);
  return { page: parts[0] || 'home', tab: parts[1] || null };
}

function getPage() {
  return getRoute().page;
}

function getSettingsTab() {
  return getRoute().tab || 'menu';
}

function revokeAudioUrl() {
  if (audioObjectUrl) {
    URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = null;
  }
}

async function playSubmission(submissionId) {
  revokeAudioUrl();
  const season = getCurrentSeason(state);
  const sub = season.submissions[submissionId];
  if (!sub) return;
  const blob = await getAudioBlob(sub.audioId);
  if (!blob) {
    alert('音频加载失败，请检查网络或云同步配置。');
    return;
  }
  audioObjectUrl = URL.createObjectURL(blob);
  const player = $('#review-player');
  if (player) {
    player.src = audioObjectUrl;
    player.load();
  }
}

function submissionsForUser(userId) {
  const season = getCurrentSeason(state);
  return Object.values(season.submissions).filter((s) => s.userId === userId);
}

function reviewsByUser(userId) {
  const season = getCurrentSeason(state);
  return season.reviews.filter((r) => r.reviewerId === userId);
}

function reviewableSubmissions(userId) {
  const season = getCurrentSeason(state);
  const reviewed = new Set(
    season.reviews.filter((r) => r.reviewerId === userId).map((r) => r.submissionId)
  );
  return Object.values(season.submissions).filter(
    (s) => s.userId !== userId && !reviewed.has(s.id)
  );
}

function computeRankings(season) {
  const subs = Object.values(season.submissions);
  const bySubmission = {};

  for (const sub of subs) {
    bySubmission[sub.id] = {
      submission: sub,
      user: state.users[sub.userId],
      criterionSums: Object.fromEntries(CRITERIA_IDS.map((id) => [id, 0])),
      criterionCounts: Object.fromEntries(CRITERIA_IDS.map((id) => [id, 0])),
      reviewCount: 0,
    };
  }

  for (const review of season.reviews) {
    const entry = bySubmission[review.submissionId];
    if (!entry) continue;
    entry.reviewCount++;
    for (const id of CRITERIA_IDS) {
      const score = review.scores?.[id];
      if (typeof score === 'number') {
        entry.criterionSums[id] += score;
        entry.criterionCounts[id]++;
      }
    }
  }

  const results = [];
  for (const entry of Object.values(bySubmission)) {
    const criterionAvgs = {};
    for (const id of CRITERIA_IDS) {
      const c = entry.criterionCounts[id];
      criterionAvgs[id] = c > 0 ? entry.criterionSums[id] / c : null;
    }
    const valid = CRITERIA_IDS.map((id) => criterionAvgs[id]).filter((v) => v != null);
    const totalAvg =
      valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    results.push({ ...entry, criterionAvgs, totalAvg });
  }
  return results;
}

function sortByScore(items, getter) {
  return [...items].sort((a, b) => {
    const va = getter(a);
    const vb = getter(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va;
  });
}

function renderSettings() {
  const user = currentUser();
  const season = getCurrentSeason(state);
  const cloudHint = isCloudEnabled()
    ? '数据已云端同步，无需手动导入导出。'
    : '未配置云同步时，多人需用导出/导入合并。';
  return renderSettingsPage(user, season, cloudHint, getSettingsTab());
}

async function bindSeasonRulesForm(rulesInput) {
  try {
    assertAdmin(currentUser());
  } catch (e) {
    alert(e.message);
    return;
  }
  const rules = {
    minParticipants: rulesInput.minParticipants,
    minSubmissions: rulesInput.minSubmissions,
    newSeasonDelaySec: rulesInput.newSeasonDelaySec,
    autoProgress: rulesInput.autoProgress,
  };
  setDefaultSeasonRulesTemplate(rules);
  await saveSeasonRules(state, rules, {
    cloudActive,
    updateSeasonRulesRemote,
    saveState,
  });
  if (cloudActive()) await reloadFromCloud();
  else persist();
  alert('赛季规则已保存');
  render();
}

function bindAdminActivityEvents() {
  $('#btn-set-phase')?.addEventListener('click', async () => {
    try {
      assertAdmin(currentUser());
    } catch (e) {
      alert(e.message);
      return;
    }
    const phase = $('#phase-select').value;
    try {
      if (cloudActive()) {
        await updateSeasonPhase(state.currentSeasonId, phase);
        await reloadFromCloud();
        render();
      } else {
        const season = getCurrentSeason(state);
        season.phase = phase;
        state.phase = phase;
        if (phase === 'revealed' && !season.endedAt) season.endedAt = Date.now();
        persist();
      }
    } catch (err) {
      alert('更新失败：' + err.message);
    }
  });

  $('#btn-end-season')?.addEventListener('click', async () => {
    try {
      assertAdmin(currentUser());
    } catch (e) {
      alert(e.message);
      return;
    }
    if (!confirm('确定结束当前赛季？将归档并开启下一赛季。')) return;
    try {
      if (cloudActive()) {
        const nextId = await startNewSeason(state.currentSeasonId);
        state.currentSeasonId = nextId;
        await reloadFromCloud();
        render();
      } else {
        const season = getCurrentSeason(state);
        season.phase = 'revealed';
        season.endedAt = Date.now();
        state.currentSeasonId += 1;
        ensureSeason(state, state.currentSeasonId);
        getCurrentSeason(state).phase = 'register';
        state.phase = 'register';
        persist();
      }
    } catch (err) {
      alert('操作失败：' + err.message);
    }
  });

  $('#btn-export')?.addEventListener('click', async () => {
    try {
      assertAdmin(currentUser());
    } catch (e) {
      alert(e.message);
      return;
    }
    try {
      const data = await exportSeasonData(state, state.currentSeasonId);
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `beat-battle-s${state.currentSeasonId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      alert('导出失败：' + err.message);
    }
  });

  $('#import-file')?.addEventListener('change', async (e) => {
    try {
      assertAdmin(currentUser());
    } catch (err) {
      alert(err.message);
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      state = await importSeasonData(state, payload);
      if (payload.season?.id) state.currentSeasonId = payload.season.id;
      persist();
      alert('数据已合并导入');
    } catch (err) {
      alert('导入失败：' + err.message);
    }
    e.target.value = '';
  });
}

function renderHome() {
  const user = currentUser();
  const season = getCurrentSeason(state);
  const mySubs = user ? submissionsForUser(user.id) : [];
  const pending = user ? reviewableSubmissions(user.id).length : 0;
  const reviewed = user ? reviewsByUser(user.id).length : 0;
  return `
    <section class="hero">
      <h1>Beat Battle 音频评阅</h1>
      <p class="subtitle">盲听打分 · 赛季制 · 云端同步</p>
    </section>
    <div class="card season-badge">
      <span>第 <strong>${season.id}</strong> 赛季</span>
      <span class="phase-tag phase-${season.phase}">${phaseLabel(season.phase)}</span>
    </div>
    ${(p => p ? `<div class="card season-progress-card">${p}</div>` : '')(formatSeasonProgressHtml(season))}
    ${
      !user
        ? `
      <div class="card">
        <h2>参与评阅</h2>
        <p>输入你的昵称，同一昵称在各端视为同一人。</p>
        <form id="join-form" class="form-row">
          <input type="text" id="display-name" placeholder="你的昵称" maxlength="32" required />
          <button type="submit" class="btn primary">加入本赛季</button>
        </form>
      </div>`
        : `
      <div class="card user-card">
        <p>你好，<strong>${escapeHtml(user.name)}</strong></p>
        <button type="button" class="btn ghost btn-sm" id="btn-switch-user">切换身份</button>
      </div>
      <div class="grid-actions">
        <a href="#upload" class="action-tile ${season.phase !== 'upload' && season.phase !== 'register' ? 'disabled' : ''}">
          <span class="tile-icon">🎤</span>
          <span class="tile-title">上传作品</span>
          <span class="tile-desc">${mySubs.length ? '已上传 ' + mySubs.length + ' 首' : '提交你的音频'}</span>
        </a>
        <a href="#review" class="action-tile ${season.phase !== 'review' ? 'disabled' : ''}">
          <span class="tile-icon">🎧</span>
          <span class="tile-title">开始评阅</span>
          <span class="tile-desc">待评 ${pending} · 已评 ${reviewed}</span>
        </a>
        <a href="#rankings" class="action-tile ${season.phase !== 'revealed' ? 'disabled' : ''}">
          <span class="tile-icon">🏆</span>
          <span class="tile-title">赛季排名</span>
          <span class="tile-desc">${season.phase === 'revealed' ? '姓名已揭晓' : '评阅结束后开放'}</span>
        </a>
        <a href="${MUSIC_PROD_URL}" class="action-tile" target="_blank" rel="noopener">
          <span class="tile-icon">🎹</span>
          <span class="tile-title">前往编曲</span>
          <span class="tile-desc">HarmonyForge 制作并发布到制作库</span>
        </a>
      </div>`
    }
  `;
}

function phaseLabel(phase) {
  const map = {
    register: '报名中',
    upload: '上传作品',
    review: '评阅中',
    revealed: '已揭晓',
  };
  return map[phase] || phase;
}

function renderUpload() {
  const user = currentUser();
  if (!user) return redirectNotice('请先加入本赛季', '#home');
  const season = getCurrentSeason(state);
  if (season.phase !== 'upload' && season.phase !== 'register') {
    return redirectNotice('当前阶段不可上传', '#home');
  }
  const mySubs = submissionsForUser(user.id);
  const cloudLibrary = isCloudEnabled();
  const libraryItems = publishedWorksCache.length
    ? publishedWorksCache
        .map(
          (w) => `
        <li class="published-item" data-work-id="${w.id}">
          <div class="published-meta">
            <strong>${escapeHtml(w.title)}</strong>
            <span class="muted">${new Date(w.publishedAt).toLocaleString('zh-CN')}</span>
          </div>
          <div class="published-actions">
            <button type="button" class="btn ghost btn-sm btn-preview-work" data-work-id="${w.id}">试听</button>
            <button type="button" class="btn primary btn-sm btn-submit-work" data-work-id="${w.id}">提交参赛</button>
          </div>
        </li>`
        )
        .join('')
    : '<li class="muted published-empty">制作库暂无作品，请先在编曲站发布。</li>';

  return `
    <section class="page-header">
      <a href="#home" class="back">← 主页</a>
      <h1>上传作品</h1>
      <p>评阅者<strong>不会</strong>看到文件名，仅通过播放打分。${isCloudEnabled() ? '已开启云同步，他人将自动看到新作品。' : ''}</p>
    </section>
    ${
      cloudLibrary
        ? `
    <div class="upload-mode-tabs" role="tablist">
      <button type="button" class="upload-tab ${uploadMode === 'local' ? 'active' : ''}" data-mode="local">本地上传</button>
      <button type="button" class="upload-tab ${uploadMode === 'library' ? 'active' : ''}" data-mode="library">制作库</button>
    </div>`
        : ''
    }
    <div class="card upload-panel ${uploadMode === 'local' || !cloudLibrary ? '' : 'hidden'}" id="upload-panel-local">
      <form id="upload-form">
        <label class="file-drop" id="file-drop">
          <input type="file" id="audio-file" accept="audio/*" required hidden />
          <span class="drop-text">点击或拖拽音频文件到此处</span>
          <span class="drop-hint">支持 wav、mp3、ogg、flac、m4a 等</span>
        </label>
        <button type="submit" class="btn primary full" id="upload-btn" disabled>提交作品</button>
      </form>
    </div>
    ${
      cloudLibrary
        ? `
    <div class="card upload-panel ${uploadMode === 'library' ? '' : 'hidden'}" id="upload-panel-library">
      <p class="hint">从 HarmonyForge 发布到制作库的作品可在此一键提交参赛。</p>
      <ul class="published-list">${libraryItems}</ul>
      <audio id="library-preview-player" controls playsinline webkit-playsinline class="audio-player library-preview" hidden></audio>
    </div>`
        : ''
    }
    ${
      mySubs.length
        ? `<div class="card"><h2>我的提交</h2><ul class="sub-list">${mySubs
            .map(
              (s) => `<li><span>作品 #${s.id.slice(0, 8)}</span><span class="muted">${new Date(s.uploadedAt).toLocaleString('zh-CN')}</span></li>`
            )
            .join('')}</ul></div>`
        : ''
    }
  `;
}

function renderReview() {
  const user = currentUser();
  if (!user) return redirectNotice('请先加入本赛季', '#home');
  const season = getCurrentSeason(state);
  if (season.phase !== 'review') return redirectNotice('当前不在评阅阶段', '#home');

  const queue = reviewableSubmissions(user.id);
  if (queue.length === 0) {
    return `
      <section class="page-header"><a href="#home" class="back">← 主页</a><h1>评阅</h1></section>
      <div class="card empty-state">
        <p>🎉 你已评完所有他人作品（不会评阅自己的作品）。</p>
        <a href="#home" class="btn primary">返回主页</a>
      </div>`;
  }

  const sub = queue[0];
  const progress = reviewsByUser(user.id).length;
  const totalOthers = Object.values(season.submissions).filter((s) => s.userId !== user.id).length;

  const criteriaHtml = CRITERIA.map(
    (c) => `
    <fieldset class="criterion" data-criterion="${c.id}">
      <legend>${c.name}</legend>
      <div class="score-buttons">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) => `
          <label class="score-option">
            <input type="radio" name="score-${c.id}" value="${n}" required />
            <span class="score-num">${n}</span>
            <span class="score-desc">${c.descriptions[n]}</span>
          </label>`
          )
          .join('')}
      </div>
    </fieldset>`
  ).join('');

  return `
    <section class="page-header">
      <a href="#home" class="back">← 主页</a>
      <h1>盲听评阅</h1>
      <p class="progress-text">第 ${progress + 1} / ${totalOthers} 首 · 匿名编号 <code>${sub.id.slice(0, 8)}</code></p>
    </section>
    <div class="card player-card">
      <p class="blind-notice">🔒 盲评模式：不显示作者与文件名</p>
      <audio id="review-player" controls controlsList="nodownload" class="audio-player"></audio>
      <p class="hint">请完整播放后再打分</p>
    </div>
    <form id="review-form" class="card" data-submission-id="${sub.id}">
      ${criteriaHtml}
      <button type="submit" class="btn primary full">提交本首评分</button>
    </form>
  `;
}

function renderRankings() {
  const season = getCurrentSeason(state);
  if (season.phase !== 'revealed') return redirectNotice('排名将在揭晓后公布', '#home');

  const results = computeRankings(season);
  const byTotal = sortByScore(results, (r) => r.totalAvg);
  const totalTable = byTotal
    .map((r, i) => rowHtml(r, i + 1, (x) => x.totalAvg?.toFixed(2) ?? '—'))
    .join('');

  const criterionSections = CRITERIA.map((c) => {
    const sorted = sortByScore(results, (r) => r.criterionAvgs[c.id]);
    const rows = sorted
      .map((r, i) => rowHtml(r, i + 1, (x) => x.criterionAvgs[c.id]?.toFixed(2) ?? '—'))
      .join('');
    return `
      <div class="card">
        <h2>${c.name} 排名</h2>
        <table class="rank-table">
          <thead><tr><th>#</th><th>姓名</th><th>均分</th><th>评阅数</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  return `
    <section class="page-header">
      <a href="#home" class="back">← 主页</a>
      <h1>第 ${season.id} 赛季排名</h1>
      <p>姓名已揭晓 · 各维度与总均分（不显示哪位评阅人打的分数）</p>
    </section>
    <div class="card highlight">
      <h2>总均分排名</h2>
      <table class="rank-table">
        <thead><tr><th>#</th><th>姓名</th><th>总均分</th><th>评阅数</th></tr></thead>
        <tbody>${totalTable}</tbody>
      </table>
    </div>
    ${criterionSections}
  `;
}

function rowHtml(r, rank, scoreFn) {
  const name = r.user?.name ?? '未知';
  return `<tr><td>${rank}</td><td><strong>${escapeHtml(name)}</strong></td><td>${scoreFn(r)}</td><td>${r.reviewCount}</td></tr>`;
}

function redirectNotice(msg, href) {
  return `<div class="card empty-state"><p>${escapeHtml(msg)}</p><a href="${href}" class="btn primary">返回</a></div>`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function updateVersionUI() {
  const label = formatVersionLabel();
  syncVersionLabels();
  const ver = $('#nav-version');
  if (ver) {
    ver.title = `Beat Battle ${label}\n有新版本时版本号会高亮，或点击「更新」`;
  }
}

function render() {
  if (!state) {
    $('#app').innerHTML = '<div class="card empty-state"><p>加载中…</p></div>';
    return;
  }
  const page = getPage();
  const navUser = currentUser();
  updateVersionUI();
  $('#nav-season').textContent = `S${state.currentSeasonId}`;
  $('#nav-user').textContent = navUser
    ? navUser.name + (isAdmin(navUser) ? ' · 管理' : '')
    : '未登录';
  const syncEl = $('#nav-sync');
  if (syncEl) syncEl.textContent = isCloudEnabled() ? '☁️' : '💾';

  let html = '';
  switch (page) {
    case 'upload':
      html = renderUpload();
      break;
    case 'review':
      html = renderReview();
      break;
    case 'rankings':
      html = renderRankings();
      break;
    case 'settings':
      html = renderSettings();
      break;
    default:
      html = renderHome();
  }
  $('#app').innerHTML = html;
  bindPageEvents(page);
}


async function refreshPublishedWorks() {
  const user = currentUser();
  if (!user || !isCloudEnabled()) {
    publishedWorksCache = [];
    return;
  }
  try {
    publishedWorksCache = await listPublishedWorks(user.id);
  } catch (err) {
    console.error(err);
    publishedWorksCache = [];
  }
}

function bindUploadPageEvents() {
  const input = $('#audio-file');
  const drop = $('#file-drop');
  const btn = $('#upload-btn');

  const onFile = (file) => {
    if (!file || !file.type.startsWith('audio/')) {
      alert('请选择音频文件');
      return;
    }
    input.files = createFileList(file);
    drop.querySelector('.drop-text').textContent = '已选择文件（评阅者不会看到此名称）';
    btn.disabled = false;
  };

  drop?.addEventListener('click', () => input?.click());
  drop?.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  });
  drop?.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop?.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    onFile(e.dataTransfer.files[0]);
  });
  input?.addEventListener('change', () => onFile(input.files[0]));

  $('#upload-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = currentUser();
    const file = input.files[0];
    if (!user || !file) return;
    btn.disabled = true;
    btn.textContent = '上传中…';
    try {
      if (cloudActive()) {
        await createSubmission(state.currentSeasonId, user.id, file);
        await reloadFromCloud();
        scheduleAutoProgress();
        setHash('upload');
      } else {
        const audioId = generateId();
        await saveAudioBlob(audioId, file);
        const season = getCurrentSeason(state);
        const subId = generateId();
        season.submissions[subId] = {
          id: subId,
          userId: user.id,
          audioId,
          uploadedAt: Date.now(),
        };
        persist();
        scheduleAutoProgress();
        setHash('upload');
      }
    } catch (err) {
      alert('上传失败：' + err.message);
      btn.disabled = false;
      btn.textContent = '提交作品';
    }
  });

  document.querySelectorAll('.upload-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      uploadMode = tab.dataset.mode || 'local';
      if (uploadMode === 'library') await refreshPublishedWorks();
      render();
    });
  });

  document.querySelectorAll('.btn-preview-work').forEach((el) => {
    el.addEventListener('click', async () => {
      const work = publishedWorksCache.find((w) => w.id === el.dataset.workId);
      const player = $('#library-preview-player');
      if (!work || !player) {
        alert('无法加载作品信息');
        return;
      }
      const prevLabel = el.textContent;
      el.disabled = true;
      el.textContent = '加载中…';
      try {
        const { url, error } = await resolveWorkPreviewUrl(work);
        if (!url) {
          alert(error || '试听失败：无法获取音频地址');
          return;
        }
        player.hidden = false;
        player.src = url;
        player.load();
        await player.play();
      } catch (err) {
        alert('试听失败：' + (err.message || err));
      } finally {
        el.disabled = false;
        el.textContent = prevLabel;
      }
    });
  });

  document.querySelectorAll('.btn-submit-work').forEach((el) => {
    el.addEventListener('click', async () => {
      const user = currentUser();
      const work = publishedWorksCache.find((w) => w.id === el.dataset.workId);
      if (!user || !work) return;
      el.disabled = true;
      const prev = el.textContent;
      el.textContent = '提交中…';
      try {
        if (cloudActive()) {
          await createSubmissionFromPublished(state.currentSeasonId, user.id, work);
          try {
            await reloadFromCloud();
          } catch (reloadErr) {
            console.error(reloadErr);
            alert('作品已提交，但刷新列表失败：' + reloadErr.message + '\n请点底部「更新」后查看主页');
          }
          scheduleAutoProgress();
          setHash('home');
          alert('提交成功！可在主页查看「已上传」数量');
        } else {
          alert('请先配置云同步');
        }
      } catch (err) {
        alert('提交失败：' + err.message);
        el.disabled = false;
        el.textContent = prev;
      }
    });
  });
}

function bindPageEvents(page) {
  if (page === 'home' || !page) {
    $('#join-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#display-name').value.trim();
      if (!name) return;
      try {
        if (cloudActive()) {
          const u = await findOrCreateUser(name);
          state.currentUserId = u.id;
          state.users[u.id] = { id: u.id, name: u.name, joinedAt: Date.now() };
          setCurrentUserId(u.id);
          saveSession({ userId: u.id, userName: u.name });
          grantAdminSessionIfEligible(u.name);
          await saveSeasonParticipant(state, u.id, { cloudActive, joinSeasonParticipantRemote, saveState });
          await reloadFromCloud();
          scheduleAutoProgress();
        } else {
          let user = Object.values(state.users).find((u) => u.name === name);
          if (!user) {
            user = { id: generateId(), name, joinedAt: Date.now() };
            state.users[user.id] = user;
          }
          state.currentUserId = user.id;
          saveSession({ userId: user.id, userName: user.name });
          grantAdminSessionIfEligible(user.name);
          await saveSeasonParticipant(state, user.id, { cloudActive: () => false, saveState });
          persist();
          scheduleAutoProgress();
        }
      } catch (err) {
        alert('加入失败：' + err.message);
      }
    });

    $('#btn-switch-user')?.addEventListener('click', () => {
      revokeAdminSession();
      state.currentUserId = null;
      setCurrentUserId(null);
      clearSession();
      persist();
    });

  }


  if (page === 'settings') {
    bindSettingsPageEvents({
      user: currentUser(),
      onReload: reloadFromCloud,
      onRender: render,
      bindActivity: bindAdminActivityEvents,
      bindSeasonRules: bindSeasonRulesForm,
      tab: getSettingsTab(),
    });
    if (isCloudEnabled()) subscribeSeasonChanges(scheduleCloudReload);
  }

  if (page === 'upload') {
    if (isCloudEnabled() && uploadMode === 'library') {
      refreshPublishedWorks().then(() => {
        if (getPage() === 'upload') render();
      });
    }
    bindUploadPageEvents();
  }

  if (page === 'review') {
    const form = $('#review-form');
    const subId = form?.dataset.submissionId;
    if (subId) playSubmission(subId);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = currentUser();
      if (!user || !subId) return;
      const scores = {};
      for (const c of CRITERIA) {
        const selected = form.querySelector(`input[name="score-${c.id}"]:checked`);
        if (!selected) {
          alert(`请为「${c.name}」打分`);
          return;
        }
        scores[c.id] = Number(selected.value);
      }
      const season = getCurrentSeason(state);
      const sub = season.submissions[subId];
      if (!sub || sub.userId === user.id) {
        alert('不能评阅自己的作品');
        return;
      }
      try {
        if (cloudActive()) {
          await createReview(state.currentSeasonId, user.id, subId, scores);
          revokeAudioUrl();
          await reloadFromCloud();
          scheduleAutoProgress();
          setHash('review');
        } else {
          season.reviews.push({
            id: generateId(),
            reviewerId: user.id,
            submissionId: subId,
            scores,
            totalAvg: averageScores(scores),
            reviewedAt: Date.now(),
          });
          revokeAudioUrl();
          persist();
          scheduleAutoProgress();
          setHash('review');
        }
      } catch (err) {
        alert('提交失败：' + err.message);
      }
    });
  }
}

function createFileList(file) {
  const dt = new DataTransfer();
  dt.items.add(file);
  return dt.files;
}

window.addEventListener('hashchange', () => {
  revokeAudioUrl();
  revokeWorkPreviewUrl();
  render();
});

function bindDebugCopy() {
  $('#btn-copy-debug')?.addEventListener('click', async () => {
    try {
      await copyDebugInfo(state);
      const toast = $('#copy-debug-toast');
      if (toast) {
        toast.hidden = false;
        setTimeout(() => { toast.hidden = true; }, 2000);
      }
    } catch (err) {
      alert('复制失败：' + err.message);
    }
  });
}

function bindGlobalNav() {
  document.getElementById('nav-settings-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    setHash('settings');
  });
}

async function bootstrap() {
  await loadVersionMeta();
  updateVersionUI();
  bindDebugCopy();
  initUpdateUI();
  bindGlobalNav();
  if (isCloudEnabled()) {
    initCloud();
    try {
      state = await loadState();
      subscribeSeasonChanges(scheduleCloudReload);
    } catch (err) {
      console.error(err);
      $('#app').innerHTML = `<div class="card empty-state"><p>云同步连接失败：${escapeHtml(err.message)}</p><p class="hint">请确认 Supabase 已执行 schema.sql 与 audio 存储桶。</p></div>`;
      return;
    }
  } else {
    state = await loadState();
  }
  ensureSeason(state, state.currentSeasonId);
  normalizeAllSeasons();
  const bootUser = currentUser();
  if (bootUser) {
    grantAdminSessionIfEligible(bootUser.name);
    await saveSeasonParticipant(state, bootUser.id, { cloudActive, joinSeasonParticipantRemote, saveState });
  }
  await runAutoProgress();
  if (!location.hash) setHash('home');
  render();
  scheduleAutoProgress();
}

window.addEventListener('load', bootstrap);
