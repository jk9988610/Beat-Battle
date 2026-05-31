/** 评阅站 ↔ 编曲站跨页会话（同域 localStorage） */
export const MUSIC_PROD_URL = 'https://jk9988610.github.io/Music-production-website/';
export const BEAT_BATTLE_URL = 'https://jk9988610.github.io/Beat-Battle/';

const LS_SESSION = 'beat-battle-cloud-session';

export function saveSession({ userId, userName }) {
  if (!userId || !userName) return;
  localStorage.setItem(
    LS_SESSION,
    JSON.stringify({ userId, userName, savedAt: Date.now() })
  );
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.userId && parsed?.userName) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearSession() {
  localStorage.removeItem(LS_SESSION);
}
