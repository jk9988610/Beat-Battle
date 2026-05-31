/**
 * 制作库试听：固定底栏播放器，试听期间锁定 UI 刷新（避免平板上一闪而过）
 */
import {
  getWorkPublicPreviewUrl,
  resolveWorkPreviewBlobUrl,
  revokeWorkPreviewUrl,
} from './published-works.js';

let previewLock = false;
let pendingUiRefresh = false;
let pendingCloudReload = false;
let onUnlockCallback = null;

export function isLibraryPreviewLocked() {
  return previewLock;
}

export function setLibraryPreviewUnlockHandler(fn) {
  onUnlockCallback = fn;
}

export function getLibraryPreviewPlayer() {
  return document.getElementById('library-preview-player');
}

export function getLibraryPreviewDock() {
  return document.getElementById('library-preview-dock');
}

function isPlayerAudible(player) {
  if (!player?.src) return false;
  return previewLock || !player.paused || player.currentTime > 0;
}

export function shouldDeferUiRefresh() {
  return previewLock || isPlayerAudible(getLibraryPreviewPlayer());
}

export function lockLibraryPreview() {
  previewLock = true;
}

export function unlockLibraryPreview() {
  if (!previewLock) return;
  previewLock = false;
  onUnlockCallback?.();
}

export function markPendingUiRefresh() {
  pendingUiRefresh = true;
}

export function markPendingCloudReload() {
  pendingCloudReload = true;
}

export function consumePendingCloudReload() {
  const v = pendingCloudReload;
  pendingCloudReload = false;
  return v;
}

export function consumePendingUiRefresh() {
  const v = pendingUiRefresh;
  pendingUiRefresh = false;
  return v;
}

export function bindLibraryPreviewLifecycle() {
  const player = getLibraryPreviewPlayer();
  if (!player || player.dataset.previewLifecycle) return;
  player.dataset.previewLifecycle = '1';

  player.addEventListener('playing', () => {
    lockLibraryPreview();
  });

  player.addEventListener('pause', () => {
    window.setTimeout(() => {
      if (!player.src || player.ended) return;
      if (!player.paused) return;
      if (previewLock) unlockLibraryPreview();
    }, 400);
  });

  player.addEventListener('ended', () => {
    unlockLibraryPreview();
  });
}

/**
 * 在用户点击的同一事件栈内尽快开始播放（避免平板 await 后丢失播放权限）
 */
export function startLibraryPreview(work) {
  const player = getLibraryPreviewPlayer();
  const dock = getLibraryPreviewDock();
  if (!work || !player || !dock) {
    throw new Error('无法初始化播放器');
  }

  lockLibraryPreview();
  dock.hidden = false;
  bindLibraryPreviewLifecycle();

  const publicUrl = getWorkPublicPreviewUrl(work);
  if (!publicUrl) {
    return loadBlobThenPlay(work, player);
  }

  player.src = publicUrl;
  player.load();
  const p = player.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => loadBlobThenPlay(work, player));
  }
  return p;
}

async function loadBlobThenPlay(work, player) {
  try {
    const blobUrl = await resolveWorkPreviewBlobUrl(work);
    player.src = blobUrl;
    player.load();
    await player.play();
  } catch (err) {
    unlockLibraryPreview();
    throw err;
  }
}

export function stopLibraryPreview() {
  const player = getLibraryPreviewPlayer();
  const dock = getLibraryPreviewDock();
  previewLock = false;
  if (player) {
    player.pause();
    player.removeAttribute('src');
  }
  if (dock) dock.hidden = true;
  revokeWorkPreviewUrl();
}
