/**
 * 版本管理与在线更新（与 HarmonyForge 制作站机制一致）
 * 页面内嵌 meta 为「当前运行版本」；与远端 version.json 比较后显示更新按钮
 */
let BUNDLED_VERSION = '1.9.2';
let BUNDLED_BUILD = 'dev';

let remoteVersion = null;
let remoteBuild = null;
let meta = { name: 'Beat Battle', version: BUNDLED_VERSION, build: BUNDLED_BUILD };

function readBundledFromMeta() {
  const mv = document.querySelector('meta[name="bb-app-version"]')?.content;
  const mb = document.querySelector('meta[name="bb-app-build"]')?.content;
  if (mv && mv !== 'dev') {
    BUNDLED_VERSION = mv;
    meta.version = mv;
  }
  if (mb && mb !== 'dev') {
    BUNDLED_BUILD = mb;
    meta.build = mb;
  }
}

function versionUrl() {
  return `version.json?t=${Date.now()}`;
}

async function fetchRemote() {
  const res = await fetch(versionUrl(), {
    cache: 'no-store',
    headers: { Accept: 'application/json', Pragma: 'no-cache' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function compareVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function getBundled() {
  return { version: BUNDLED_VERSION, build: BUNDLED_BUILD };
}

export function isNewer(remote) {
  if (!remote?.version) return false;
  const { version: localVer, build: localBuild } = getBundled();
  if (compareVersion(remote.version, localVer) > 0) return true;
  if (remote.version === localVer && remote.build && remote.build !== localBuild) {
    return true;
  }
  return false;
}

function noteRemote(remote) {
  if (!remote) return;
  remoteVersion = remote.version ?? remoteVersion;
  remoteBuild = remote.build ?? remoteBuild;
  meta = { ...meta, ...remote };
}

export function isUpdateAvailable() {
  return isNewer({ version: remoteVersion, build: remoteBuild });
}

export function syncVersionLabels() {
  const label = formatVersionLabel();
  const hasUpdate = isUpdateAvailable();

  document.querySelectorAll('.bb-version-label').forEach((el) => {
    el.textContent = label;
  });

  document.querySelectorAll('.bb-version-badge').forEach((el) => {
    el.classList.toggle('has-update', hasUpdate);
    el.title = hasUpdate
      ? `运行 ${label} · 可更新至 v${remoteVersion} (${remoteBuild})`
      : `当前 ${label}`;
  });

  const btn = document.getElementById('btn-update');
  if (btn) {
    btn.classList.toggle('has-update', hasUpdate);
    btn.title = hasUpdate
      ? `发现新版本 v${remoteVersion}，点击更新`
      : '检查是否有新版本';
  }
}

export async function loadVersionMeta() {
  readBundledFromMeta();
  try {
    const remote = await fetchRemote();
    noteRemote(remote);
  } catch {
    /* 离线或首次加载失败时仍显示 bundled 版本 */
  }
  syncVersionLabels();
  return { ...meta };
}

export function getVersionMeta() {
  return {
    ...meta,
    bundledVersion: BUNDLED_VERSION,
    bundledBuild: BUNDLED_BUILD,
    remoteVersion,
    remoteBuild,
    updateAvailable: isUpdateAvailable(),
  };
}

export function formatVersionLabel() {
  const buildShort =
    BUNDLED_BUILD && BUNDLED_BUILD !== 'dev'
      ? ` · ${String(BUNDLED_BUILD).slice(-12)}`
      : '';
  return `v${BUNDLED_VERSION}${buildShort}`;
}

export async function checkUpdate() {
  try {
    const remote = await fetchRemote();
    noteRemote(remote);
    syncVersionLabels();
    const bundled = getBundled();
    if (isNewer(remote)) {
      return { status: 'available', remote, bundled };
    }
    return { status: 'latest', remote, bundled };
  } catch (err) {
    return { status: 'error', message: err.message, bundled: getBundled() };
  }
}

export async function applyUpdate(remote) {
  if (!remote) {
    const result = await checkUpdate();
    if (result.status !== 'available') return result;
    remote = result.remote;
  }

  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* ignore */
    }
  }

  const url = new URL(location.href);
  url.searchParams.set('v', remote.build || remote.version);
  url.searchParams.set('_', String(Date.now()));
  location.replace(url.toString());
  return { status: 'reloading' };
}

export function initUpdateUI() {
  syncVersionLabels();

  const btn = document.getElementById('btn-update');
  if (!btn) return;

  loadVersionMeta().catch(() => {});

  btn.addEventListener('click', async () => {
    window.__bbUpdateHandled = true;
    window.__bbAppReady = true;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = '检测中…';
    try {
      const result = await checkUpdate();
      const bundled = result.bundled || getBundled();
      if (result.status === 'available') {
        btn.textContent = '更新中…';
        const ok = confirm(
          `发现新版本 v${result.remote.version} (build ${result.remote.build})\n` +
            `当前运行 v${bundled.version} (build ${bundled.build})\n\n是否立即更新？`
        );
        if (ok) await applyUpdate(result.remote);
        else btn.textContent = prev;
      } else if (result.status === 'latest') {
        alert(
          `已是最新版本\n运行 v${bundled.version} (build ${bundled.build})\n` +
            `线上 v${result.remote?.version ?? bundled.version} (build ${result.remote?.build ?? bundled.build})`
        );
        btn.textContent = prev;
      } else {
        alert(`检查更新失败：${result.message || '未知错误'}\n将尝试强制刷新页面。`);
        btn.textContent = prev;
        if (typeof window.__bbForceReload === 'function') window.__bbForceReload();
      }
    } finally {
      window.__bbUpdateHandled = false;
      btn.disabled = false;
      if (btn.textContent === '检测中…' || btn.textContent === '更新中…') {
        btn.textContent = prev;
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadVersionMeta().then(() => syncVersionLabels()).catch(() => {});
    }
  });
}
