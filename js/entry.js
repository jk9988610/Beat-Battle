/**
 * 应用入口：捕获模块加载失败，避免永远停在 HTML「加载中」
 */
function showFatalError(err) {
  const app = document.getElementById('app');
  const msg = err?.message || String(err);
  if (app) {
    app.innerHTML = `<div class="card empty-state">
      <p><strong>页面无法启动</strong></p>
      <p class="hint">${msg.replace(/</g, '&lt;')}</p>
      <p class="hint">请点顶栏「更新」或下方按钮强制刷新。</p>
      <button type="button" class="btn primary" id="btn-fatal-reload">强制刷新</button>
    </div>`;
    document.getElementById('btn-fatal-reload')?.addEventListener('click', () => {
      if (typeof window.__bbForceReload === 'function') window.__bbForceReload();
      else location.reload();
    });
  }
  console.error('Beat Battle boot fatal:', err);
}

async function start() {
  try {
    const { bootstrap } = await import('./app.js');
    await bootstrap();
  } catch (err) {
    showFatalError(err);
    window.__bbAppReady = true;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
