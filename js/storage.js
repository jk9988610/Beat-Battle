import {
  cloudActive,
  initCloud,
  fetchRemoteState,
  downloadAudioFromCloud,
  uploadAudioToCloud,
} from './remote.js';
import { isCloudEnabled } from './config.js';
import { withTimeout } from './async-utils.js';

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
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
}

async function idbPut(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function defaultState() {
  return {
    currentSeasonId: 1,
    phase: 'register',
    currentUserId: null,
    users: {},
    seasons: {},
  };
}

export function loadLocalState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

function saveLocalState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export async function loadState() {
  const local = loadLocalState();
  if (!isCloudEnabled()) return local;
  try {
    initCloud();
    const remote = await withTimeout(fetchRemoteState(), 12000, '云同步');
    if (remote) {
      saveLocalState(remote);
      return remote;
    }
  } catch (err) {
    console.warn('云同步失败，使用本地缓存', err);
  }
  return local;
}

export function saveState(state) {
  saveLocalState(state);
}

export function ensureSeason(state, seasonId) {
  const sid = String(seasonId);
  if (!state.seasons[sid]) {
    state.seasons[sid] = {
      id: Number(seasonId),
      phase: 'register',
      startedAt: Date.now(),
      endedAt: null,
      revealedAt: null,
      participantIds: [],
      rules: null,
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

export async function saveAudioBlob(id, blob) {
  await idbPut(id, blob);
  if (cloudActive() && id.includes('/')) {
    await uploadAudioToCloud(id, blob);
  }
}

export async function getAudioBlob(id) {
  let blob = await idbGet(id);
  if (blob) return blob;
  if (cloudActive() && id.includes('/')) {
    blob = await downloadAudioFromCloud(id);
    if (blob) await idbPut(id, blob);
    return blob;
  }
  return null;
}

/** 本地模式：导出赛季（云同步开启时可选备份） */
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
      audioEntries[sub.audioId] = { mime: blob.type || 'audio/mpeg', base64: btoa(binary) };
    }
  }
  return { version: 1, season, users: state.users, audioEntries, exportedAt: Date.now() };
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
  const key = (r) => `${r.reviewerId}:${r.submissionId}`;
  const seen = new Set(mergedReviews.map(key));
  for (const r of payload.season.reviews || []) {
    const k = key(r);
    if (!seen.has(k)) {
      mergedReviews.push(r);
      seen.add(k);
    }
  }
  state.seasons[sid] = {
    ...existing,
    ...payload.season,
    participantIds: payload.season.participantIds || existing.participantIds || [],
    rules: payload.season.rules || existing.rules || null,
    submissions: mergedSubs,
    reviews: mergedReviews,
  };
  if (payload.users) state.users = { ...state.users, ...payload.users };
  for (const [audioId, entry] of Object.entries(payload.audioEntries || {})) {
    const binary = atob(entry.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    await saveAudioBlob(audioId, new Blob([bytes], { type: entry.mime || 'audio/mpeg' }));
  }
  saveState(state);
  return state;
}
