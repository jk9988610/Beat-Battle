import {
  getCloudConfig,
  setCloudConfig,
  isCloudEnabled,
  hasBuiltInCloudConfig,
  getAdminSettings,
  setAdminSettings,
} from './config.js';
import { isAdmin, tryElevateWithPin, revokeAdminSession, assertAdmin, getAdminHint } from './admin.js';
import { initCloud } from './remote.js';

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderActivityPanel(user, season, cloudHint) {
  const admin = user && isAdmin(user);
  if (!user) {
    return `
    <div class="card admin-section">
      <h2>活动管理</h2>
      <p class="hint">请先在主页加入本赛季，再验证管理员身份。</p>
    </div>`;
  }
  if (!admin) {
    return `
    <div class="card admin-section">
      <h2>活动管理 <span class="sync-badge off">仅管理员</span></h2>
      <p class="hint">${escapeHtml(getAdminHint())}</p>
    </div>`;
  }
  return `
    <div class="card admin-section admin-active">
      <h2>活动管理 <span class="sync-badge on">管理员</span></h2>
      <p class="hint">${cloudHint}</p>
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
      </div>
    </div>`;
}

export function renderSettingsPage(user, season, cloudHint) {
  const cfg = getCloudConfig();
  const on = isCloudEnabled();
  const builtIn = hasBuiltInCloudConfig();
  const admin = user && isAdmin(user);
  const adminCfg = getAdminSettings();
  const namesText = adminCfg.userNames.join('\n');

  const adminSettingsBlock = admin
    ? `
    <div class="card">
      <h2>管理员设置</h2>
      <p class="hint">保存到本浏览器。修改口令后请告知其他主持人。</p>
      <form id="admin-settings-form" class="form-col">
        <label>管理员昵称（每行一个，或用逗号分隔）
          <textarea id="admin-names" rows="3" placeholder="管理员&#10;主持人">${escapeHtml(namesText)}</textarea>
        </label>
        <label>管理员口令
          <input type="password" id="admin-pin-setting" value="${escapeHtml(adminCfg.pin)}" autocomplete="new-password" />
        </label>
        <button type="submit" class="btn primary">保存管理员设置</button>
      </form>
      <button type="button" class="btn ghost btn-sm" id="btn-revoke-admin">退出管理员身份</button>
    </div>`
    : `
    <div class="card">
      <h2>管理员设置 <span class="sync-badge off">需验证</span></h2>
      <p class="hint">仅管理员可修改昵称白名单与口令。请先在上方验证身份。</p>
    </div>`;

  return `
    <section class="page-header">
      <a href="#home" class="back">← 主页</a>
      <h1>设置</h1>
    </section>

    <div class="card">
      <h2>管理员身份</h2>
      <p class="hint">${
        admin
          ? '你当前已是管理员，可在下方「活动管理」推进赛季。'
          : '输入口令后，本标签页获得管理权限（关闭页面后需重新验证）。'
      }</p>
      ${
        admin
          ? `<p class="admin-ok">✓ 已验证为管理员</p>`
          : `<form id="admin-pin-form" class="form-row">
        <input type="password" id="admin-pin" placeholder="管理员口令" autocomplete="off" />
        <button type="submit" class="btn primary">验证</button>
      </form>`
      }
    </div>

    ${renderActivityPanel(user, season, cloudHint)}

    ${adminSettingsBlock}

    <div class="card cloud-card">
      <h2>云同步 <span class="sync-badge ${on ? 'on' : 'off'}">${on ? '已连接' : '未连接'}</span></h2>
      <p class="hint">${
        builtIn
          ? '已内置 Supabase 项目，一般无需修改。'
          : '配置后甲/乙/丙可自动同步；编曲制作页可 SDK 直传。'
      }</p>
      <details ${builtIn && on ? '' : 'open'}>
        <summary>${builtIn ? '更换云项目' : 'Supabase 配置'}</summary>
        <div class="form-col">
          <label>Project URL <input type="url" id="sb-url" value="${escapeHtml(cfg.url)}" placeholder="https://xxx.supabase.co" /></label>
          <label>anon public key <input type="password" id="sb-key" value="${escapeHtml(cfg.anonKey)}" autocomplete="off" /></label>
          <button type="button" class="btn primary" id="btn-save-cloud">保存并连接</button>
          <a href="https://github.com/jk9988610/Beat-Battle/blob/main/docs/integrate-production.md" class="link-doc" target="_blank" rel="noopener">制作页接入说明 →</a>
        </div>
      </details>
    </div>
  `;
}

export function bindSettingsPageEvents(ctx) {
  const { user, onReload, onRender, bindActivity } = ctx;

  $('#admin-pin-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = $('#admin-pin')?.value;
    if (tryElevateWithPin(pin)) {
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
      const namesRaw = $('#admin-names').value;
      const pin = $('#admin-pin-setting').value;
      setAdminSettings({
        userNames: namesRaw.split(/[\n,，、]/).map((s) => s.trim()).filter(Boolean),
        pin,
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

  if (bindActivity) bindActivity();
}
