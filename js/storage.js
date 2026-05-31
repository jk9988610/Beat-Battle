const DB_NAME = 'beat-battle-audio';
const DB_VERSION = 1;
const STORE = 'blobs';
const LS_KEY = 'beat-battle-state';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function saveAudioBlob(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAudioBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAudioBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function defaultState() {
  return {
    currentSeasonId: 1,
    phase: 'register', // register | upload | review | revealed
    currentUserId: null,
    users: {},
    seasons: {},
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export function ensureSeason(state, seasonId) {
  const sid = String(seasonId);
  if (!state.seasons[sid]) {
    state.seasons[sid] = {
      id: Number(seasonId),
      phase: 'register',
      startedAt: Date.now(),
      endedAt: null,
      submissions: {},
      reviews: [],
    };
  }
  return state.seasons[sid];
}

export function getCurrentSeason(state) {
  return ensureSeason(state, state.currentSeasonId);
}

export function generateId() {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 导出赛季数据（含 base64 音频）供合并 */
export async function exportSeasonData(state, seasonId) {
  const season = state.seasons[String(seasonId)];
  if (!season) return null;
  const audioEntries = {};
  for (const sub of Object.values(season.submissions)) {
    const blob = await getAudioBlob(sub.audioId);
    if (blob) {
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      audioEntries[sub.audioId] = {
        mime: blob.type || 'audio/mpeg',
        base64: btoa(binary),
      };
    }
  }
  return {
    version: 1,
    season,
    users: state.users,
    audioEntries,
    exportedAt: Date.now(),
  };
}

export async function importSeasonData(state, payload) {
  if (!payload?.season) throw new Error('无效的数据包');
  const sid = String(payload.season.id);
  const existing = state.seasons[sid] || payload.season;

  const mergedSubs = { ...existing.submissions };
  for (const [id, sub] of Object.entries(payload.season.submissions || {})) {
    if (!mergedSubs[id]) mergedSubs[id] = sub;
  }

  const mergedReviews = [...(existing.reviews || [])];
  const reviewKey = (r) => `${r.reviewerId}:${r.submissionId}`;
  const seen = new Set(mergedReviews.map(reviewKey));
  for (const r of payload.season.reviews || []) {
    const k = reviewKey(r);
    if (!seen.has(k)) {
      mergedReviews.push(r);
      seen.add(k);
    }
  }

  state.seasons[sid] = {
    ...existing,
    ...payload.season,
    submissions: mergedSubs,
    reviews: mergedReviews,
    phase: payload.season.phase ?? existing.phase,
  };

  if (payload.users) {
    state.users = { ...state.users, ...payload.users };
  }

  for (const [audioId, entry] of Object.entries(payload.audioEntries || {})) {
    const binary = atob(entry.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: entry.mime || 'audio/mpeg' });
    await saveAudioBlob(audioId, blob);
  }

  saveState(state);
  return state;
}
