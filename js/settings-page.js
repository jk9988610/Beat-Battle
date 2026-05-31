import {
  getCloudConfig,
  setCloudConfig,
  isCloudEnabled,
  hasBuiltInCloudConfig,
  getAdminSettings,
  setAdminSettings,
} from './config.js';
import { isAdmin, tryElevateWithPin, revokeAdminSession, getAdminHint } from './admin.js';
import { initCloud } from './remote.js';
import {
  getSeasonRules,
  getSeasonStats,
  formatSeasonProgressHtml,
  normalizeSeason,
  setDefaultSeasonRulesTemplate,
} from './season-rules.js';

const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function settingsTabsHtml(activeTab) {
  const tabs = [
    { id: 'menu', label: '选项', hash: '#settings' },
    { id: 'activity', label: '活动管理', hash: '#settings/activity' },
    { id: 'admin', label: '管理员', hash: '#settings/admin' },
    { id: 'cloud', label: '云同步', hash: '#settings/cloud' },
  ];
  return `
    <nav class="settings-tabs" aria-label="设置分类">
      ${tabs
        .map(
          (t) =>
            `<a href="${t.hash}" class="settings-tab ${activeTab === t.id ? 'active' : ''}">${t.label}</a>`
        )
        .join('')}
    </nav>`;
}

function renderActivityPanel(user, season, cloudHint) {
  const admin = user && isAdmin(user);
  if (!user) {
    return `<p class="hint">请先在主页加入本赛季，再验证管理员身份。</p>`;
  }
  if (!admin) {
    return `
      <p class="hint">${escapeHtml(getAdminHint())}</p>
      <a href="#settings/admin" class="btn primary">前往管理员验证</a>`;
  }
  normalizeSeason(season);
  const stats = getSeasonStats(season);
  const rules = getSeasonRules(season);
  return `
    <p class="hint">${cloudHint}</p>
    <div class="season-progress-card">${formatSeasonProgressHtml(season)}</div>
    <h3>赛季人数与自动推进</h3>
    <form id="season-rules-form" class="form-col">
      <label>最少参赛人数（评阅人数）
        <input type="number" id="rule-min-participants" min="1" max="99" value="${rules.minParticipants}" />
      </label>
      <label>最少作品数
        <input type="number" id="rule-min-submissions" min="1" max="99" value="${rules.minSubmissions}" />
      </label>
      <label>公布成绩后自动开新赛季（秒，0=立即）
        <input type="number" id="rule-new-season-delay" min="0" max="3600" value="${rules.newSeasonDelaySec}" />
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="rule-auto-progress" ${rules.autoProgress ? 'checked' : ''} />
        满足条件时自动推进阶段
      </label>
      <button type="submit" class="btn primary">保存本赛季规则</button>
      <p class="hint">报名阶段可直接上传作品，无需等人齐；作品数与参赛人数达标后自动进入评阅；全部评完后自动公布成绩并开启新赛季。</p>
    </form>
    <h3>手动阶段</h3>
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
    <div class="import-export ${isCloudEnabled() ? 'muted-section' : ''}">
      <button type="button" class="btn" id="btn-export">导出备份</button>
      <label class="btn file-label">
        导入合并
        <input type="file" id="import-file" accept=".json,application/json" hidden />
      </label>
    </div>`;
}

function renderSettingsMenu() {
  return `
    <div class="settings-menu">
      <a href="#settings/activity" class="settings-option">
        <span class="settings-option-title">活动管理</span>
        <span class="settings-option-desc">推进赛季阶段、结束赛季、导入导出</span>
      </a>
      <a href="#settings/admin" class="settings-option">
        <span class="settings-option-title">管理员</span>
        <span class="settings-option-desc">验证身份、昵称白名单、口令</span>
      </a>
      <a href="#settings/cloud" class="settings-option">
        <span class="settings-option-title">云同步</span>
        <span class="settings-option-desc">Supabase 连接与制作页直传</span>
      </a>
    </div>`;
}

function renderAdminSection(user) {
  const admin = user && isAdmin(user);
  const adminCfg = getAdminSettings();
  const namesText = adminCfg.userNames.join('\n');

  const identity = `
    <h3>身份验证</h3>
    <p class="hint">${
      admin
        ? '你当前已是管理员，可使用「活动管理」。'
        : '输入口令后，本标签页获得管理权限（关闭页面后需重新验证）。'
    }</p>
    ${
      admin
        ? `<p class="admin-ok">✓ 已验证为管理员</p>`
        : `<form id="admin-pin-form" class="form-row">
      <input type="password" id="admin-pin" placeholder="管理员口令" autocomplete="off" />
      <button type="submit" class="btn primary">验证</button>
    </form>`
    }`;

  const config = admin
    ? `
    <h3>管理员设置</h3>
    <form id="admin-settings-form" class="form-col">
      <label>管理员昵称（每行一个，或用逗号分隔）
        <textarea id="admin-names" rows="3">${escapeHtml(namesText)}</textarea>
      </label>
      <label>管理员口令
        <input type="password" id="admin-pin-setting" value="${escapeHtml(adminCfg.pin)}" autocomplete="new-password" />
      </label>
      <button type="submit" class="btn primary">保存管理员设置</button>
    </form>
    <button type="button" class="btn ghost btn-sm" id="btn-revoke-admin">退出管理员身份</button>`
    : `<p class="hint">验证后可修改昵称白名单与口令。</p>`;

  return identity + config;
}

function renderCloudSection() {
  const cfg = getCloudConfig();
  const on = isCloudEnabled();
  const builtIn = hasBuiltInCloudConfig();
  return `
    <p class="hint">${
      builtIn ? '已内置 Supabase 项目，一般无需修改。' : '配置后多端自动同步。'
    }</p>
    <div class="form-col">
      <label>Project URL <input type="url" id="sb-url" value="${escapeHtml(cfg.url)}" placeholder="https://xxx.supabase.co" /></label>
      <label>anon public key <input type="password" id="sb-key" value="${escapeHtml(cfg.anonKey)}" autocomplete="off" /></label>
      <button type="button" class="btn primary" id="btn-save-cloud">保存并连接</button>
      <span class="sync-badge ${on ? 'on' : 'off'}">${on ? '已连接' : '未连接'}</span>
      <a href="https://github.com/jk9988610/Beat-Battle/blob/main/docs/integrate-production.md" class="link-doc" target="_blank" rel="noopener">制作页接入说明 →</a>
    </div>`;
}

export function renderSettingsPage(user, season, cloudHint, tab) {
  const activeTab = tab || 'menu';
  const titles = {
    menu: '设置',
    activity: '活动管理',
    admin: '管理员',
    cloud: '云同步',
  };

  let body = '';
  if (activeTab === 'menu') {
    body = renderSettingsMenu();
  } else if (activeTab === 'activity') {
    body = renderActivityPanel(user, season, cloudHint);
  } else if (activeTab === 'admin') {
    body = renderAdminSection(user);
  } else if (activeTab === 'cloud') {
    body = renderCloudSection();
  } else {
    body = renderSettingsMenu();
  }

  return `
    <section class="page-header">
      <a href="${activeTab === 'menu' ? '#home' : '#settings'}" class="back">← ${activeTab === 'menu' ? '主页' : '设置'}</a>
      <h1>${titles[activeTab] || '设置'}</h1>
    </section>
    ${settingsTabsHtml(activeTab)}
    <div class="card settings-panel">${body}</div>
  `;
}

export function bindSettingsPageEvents(ctx) {
  const { user, onReload, onRender, bindActivity, bindSeasonRules, tab } = ctx;

  $('#admin-pin-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (tryElevateWithPin($('#admin-pin')?.value)) {
      alert('已通过管理员验证');
      onRender();
    } else {
      alert('口令错误');
    }
  });

  $('#admin-settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!user || !isAdmin(user)) {
      alert('请先验证管理员身份');
      return;
    }
    try {
      setAdminSettings({
        userNames: $('#admin-names')
          .value.split(/[\n,，、]/)
          .map((s) => s.trim())
          .filter(Boolean),
        pin: $('#admin-pin-setting').value,
      });
      alert('管理员设置已保存');
      onRender();
    } catch (err) {
      alert(err.message);
    }
  });

  $('#btn-revoke-admin')?.addEventListener('click', () => {
    revokeAdminSession();
    onRender();
  });

  $('#btn-save-cloud')?.addEventListener('click', async () => {
    const url = $('#sb-url').value.trim();
    const anonKey = $('#sb-key').value.trim();
    if (!url || !anonKey) {
      alert('请填写 Supabase URL 与 anon key');
      return;
    }
    setCloudConfig({ url, anonKey });
    initCloud();
    try {
      await onReload();
      alert('云同步已连接');
      onRender();
    } catch (err) {
      alert('连接失败：' + err.message);
    }
  });

  $('#season-rules-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!user || !isAdmin(user)) {
      alert('需要管理员权限');
      return;
    }
    if (bindSeasonRules) {
      await bindSeasonRules({
        minParticipants: Number($('#rule-min-participants')?.value),
        minSubmissions: Number($('#rule-min-submissions')?.value),
        newSeasonDelaySec: Number($('#rule-new-season-delay')?.value),
        autoProgress: $('#rule-auto-progress')?.checked,
      });
    }
  });

  if (tab === 'activity' && bindActivity) bindActivity();
}
