import { CRITERIA, CRITERIA_IDS, averageScores } from './scoring.js';
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

let state = loadState();
let audioObjectUrl = null;

const $ = (sel) => document.querySelector(sel);

function syncGlobalPhase() {
  const season = getCurrentSeason(state);
  state.phase = season.phase;
}

function persist() {
  syncGlobalPhase();
  saveState(state);
  render();
}

function currentUser() {
  return state.currentUserId ? state.users[state.currentUserId] : null;
}

function setHash(page) {
  location.hash = page;
}

function getPage() {
  const h = (location.hash || '#home').slice(1);
  return h.split('?')[0] || 'home';
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
    alert('音频数据丢失，请重新上传或导入数据包。');
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
    results.push({
      ...entry,
      criterionAvgs,
      totalAvg,
    });
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

// ——— 页面渲染 ———

function renderHome() {
  const user = currentUser();
  const season = getCurrentSeason(state);
  const mySubs = user ? submissionsForUser(user.id) : [];
  const pending = user ? reviewableSubmissions(user.id).length : 0;
  const reviewed = user ? reviewsByUser(user.id).length : 0;

  return `
    <section class="hero">
      <h1>Beat Battle 音频评阅</h1>
      <p class="subtitle">盲听打分 · 赛季制 · 揭晓排名</p>
    </section>
    <div class="card season-badge">
      <span>第 <strong>${season.id}</strong> 赛季</span>
      <span class="phase-tag phase-${season.phase}">${phaseLabel(season.phase)}</span>
    </div>
    ${
      !user
        ? `
      <div class="card">
        <h2>参与评阅</h2>
        <p>输入你的昵称，同一昵称在本赛季内视为同一人。</p>
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
      </div>`
    }
    <div class="card admin-section">
      <h2>活动管理</h2>
      <p class="hint">主持人可推进赛季阶段；多人活动时请用导出/导入合并数据。</p>
      <div class="admin-controls">
        <select id="phase-select">
          <option value="register" ${season.phase === 'register' ? 'selected' : ''}>报名中</option>
          <option value="upload" ${season.phase === 'upload' ? 'selected' : ''}>上传作品</option>
          <option value="review" ${season.phase === 'review' ? 'selected' : ''}>评阅中</option>
          <option value="revealed" ${season.phase === 'revealed' ? 'selected' : ''}>已揭晓</option>
        </select>
        <button type="button" class="btn" id="btn-set-phase">更新阶段</button>
        <button type="button" class="btn warn" id="btn-end-season">结束本赛季并开始下一季</button>
      </div>
      <div class="import-export">
        <button type="button" class="btn" id="btn-export">导出赛季数据</button>
        <label class="btn file-label">
          导入合并数据
          <input type="file" id="import-file" accept=".json,application/json" hidden />
        </label>
      </div>
    </div>
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

  return `
    <section class="page-header">
      <a href="#home" class="back">← 主页</a>
      <h1>上传作品</h1>
      <p>评阅者<strong>不会</strong>看到文件名，仅通过播放打分。</p>
    </section>
    <div class="card">
      <form id="upload-form">
        <label class="file-drop" id="file-drop">
          <input type="file" id="audio-file" accept="audio/*" required hidden />
          <span class="drop-text">点击或拖拽音频文件到此处</span>
          <span class="drop-hint">支持 wav、mp3、ogg、flac、m4a 等浏览器可播放格式</span>
        </label>
        <button type="submit" class="btn primary full" id="upload-btn" disabled>提交作品</button>
      </form>
    </div>
    ${
      mySubs.length
        ? `
    <div class="card">
      <h2>我的提交</h2>
      <ul class="sub-list">
        ${mySubs
          .map(
            (s) => `
          <li>
            <span>作品 #${s.id.slice(0, 8)}</span>
            <span class="muted">${new Date(s.uploadedAt).toLocaleString('zh-CN')}</span>
          </li>`
          )
          .join('')}
      </ul>
    </div>`
        : ''
    }
  `;
}

function renderReview() {
  const user = currentUser();
  if (!user) return redirectNotice('请先加入本赛季', '#home');
  const season = getCurrentSeason(state);
  if (season.phase !== 'review') {
    return redirectNotice('当前不在评阅阶段', '#home');
  }

  const queue = reviewableSubmissions(user.id);
  if (queue.length === 0) {
    return `
      <section class="page-header">
        <a href="#home" class="back">← 主页</a>
        <h1>评阅</h1>
      </section>
      <div class="card empty-state">
        <p>🎉 你已评完所有他人作品（不会评阅自己的作品）。</p>
        <a href="#home" class="btn primary">返回主页</a>
      </div>
    `;
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
  if (season.phase !== 'revealed') {
    return redirectNotice('排名将在揭晓后公布', '#home');
  }

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
      <p>姓名已揭晓 · 各维度与总均分</p>
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
  return `
    <tr>
      <td>${rank}</td>
      <td><strong>${escapeHtml(name)}</strong></td>
      <td>${scoreFn(r)}</td>
      <td>${r.reviewCount}</td>
    </tr>`;
}

function redirectNotice(msg, href) {
  return `
    <div class="card empty-state">
      <p>${escapeHtml(msg)}</p>
      <a href="${href}" class="btn primary">返回</a>
    </div>
  `;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function render() {
  const app = $('#app');
  const page = getPage();
  const navUser = currentUser();

  $('#nav-season').textContent = `S${state.currentSeasonId}`;
  $('#nav-user').textContent = navUser ? navUser.name : '未登录';

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
    default:
      html = renderHome();
  }
  app.innerHTML = html;
  bindPageEvents(page);
}

function bindPageEvents(page) {
  if (page === 'home' || !page) {
    $('#join-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#display-name').value.trim();
      if (!name) return;
      let user = Object.values(state.users).find((u) => u.name === name);
      if (!user) {
        user = { id: generateId(), name, joinedAt: Date.now() };
        state.users[user.id] = user;
      }
      state.currentUserId = user.id;
      persist();
    });

    $('#btn-switch-user')?.addEventListener('click', () => {
      state.currentUserId = null;
      persist();
    });

    $('#btn-set-phase')?.addEventListener('click', () => {
      const phase = $('#phase-select').value;
      const season = getCurrentSeason(state);
      season.phase = phase;
      state.phase = phase;
      if (phase === 'revealed' && !season.endedAt) {
        season.endedAt = Date.now();
      }
      persist();
    });

    $('#btn-end-season')?.addEventListener('click', async () => {
      if (!confirm('确定结束当前赛季？将归档并开启下一赛季，当前评阅数据保留在历史中。')) return;
      const season = getCurrentSeason(state);
      season.phase = 'revealed';
      season.endedAt = Date.now();
      state.currentSeasonId += 1;
      ensureSeason(state, state.currentSeasonId);
      const next = getCurrentSeason(state);
      next.phase = 'register';
      state.phase = 'register';
      persist();
    });

    $('#btn-export')?.addEventListener('click', async () => {
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
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
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

  if (page === 'upload') {
    const input = $('#audio-file');
    const drop = $('#file-drop');
    const btn = $('#upload-btn');

    const onFile = (file) => {
      if (!file || !file.type.startsWith('audio/')) {
        alert('请选择音频文件');
        return;
      }
      input.files = createFileList(file);
      drop.querySelector('.drop-text').textContent = file.name;
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
        setHash('upload');
      } catch (err) {
        alert('上传失败：' + err.message);
        btn.disabled = false;
        btn.textContent = '提交作品';
      }
    });
  }

  if (page === 'review') {
    const form = $('#review-form');
    const subId = form?.dataset.submissionId;
    if (subId) playSubmission(subId);

    form?.addEventListener('submit', (e) => {
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
      setHash('review');
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
  render();
});

window.addEventListener('load', () => {
  ensureSeason(state, state.currentSeasonId);
  if (!location.hash) setHash('home');
  render();
});
