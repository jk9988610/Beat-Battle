import { getCloudConfig, isCloudEnabled } from './config.js';
import { averageScores } from './scoring.js';
import { DEFAULT_SEASON_RULES, normalizeRules } from './season-rules.js';
import { formatSupabaseError } from './supabase-error.js';
import { normalizeProjectJsonPayload } from './project-json-utils.js';

let client = null;
let unsubscribe = null;
let clientInitPromise = null;
let supabaseLibPromise = null;

const SUPABASE_CDN_URLS = [
  'https://esm.sh/@supabase/supabase-js@2.49.1?bundle',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm',
];

async function importSupabaseLib() {
  if (!supabaseLibPromise) {
    supabaseLibPromise = (async () => {
      let lastErr;
      for (const url of SUPABASE_CDN_URLS) {
        try {
          return await import(url);
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('Supabase SDK 无法加载');
    })();
  }
  return supabaseLibPromise;
}

export function cloudActive() {
  return isCloudEnabled() && client != null;
}

export async function initCloudAsync() {
  if (!isCloudEnabled()) {
    client = null;
    return null;
  }
  if (client) return client;
  if (!clientInitPromise) {
    clientInitPromise = (async () => {
      const { createClient } = await importSupabaseLib();
      const { url, anonKey } = getCloudConfig();
      client = createClient(url, anonKey);
      return client;
    })();
  }
  return clientInitPromise;
}

export function initCloud() {
  initCloudAsync().catch((e) => console.warn('initCloud', e));
  return client;
}

export function getClient() {
  return client;
}

async function requireClient() {
  const sb = await initCloudAsync();
  if (!sb) throw new Error('云同步未就绪');
  return sb;
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

export async function fetchRemoteState() {
  const { fetchRemoteStateRest } = await import('./remote-rest.js');
  return fetchRemoteStateRest();
}

export async function ensureRemoteSeason(seasonId) {
  const sb = await requireClient();
  await sb.from('seasons').upsert({ id: seasonId, phase: 'register' });
}

export async function findOrCreateUser(name) {
  const sb = await requireClient();
  const trimmed = name.trim();
  const { data: existing } = await sb.from('users').select('*').eq('name', trimmed).maybeSingle();
  if (existing) return existing;

  const { data, error } = await sb.from('users').insert({ name: trimmed }).select().single();
  if (error) throw error;
  return data;
}

export async function uploadAudioToCloud(path, blob) {
  const sb = await requireClient();
  const { error } = await sb.storage.from('audio').upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'audio/mpeg',
  });
  if (error) throw new Error(formatSupabaseError(error));
  return path;
}

export async function copyAudioInCloud(fromPath, toPath) {
  const sb = await requireClient();
  const { error } = await sb.storage.from('audio').copy(fromPath, toPath);
  if (error) throw error;
  return toPath;
}

export async function downloadAudioFromCloud(path) {
  const sb = await requireClient();
  const { data, error } = await sb.storage.from('audio').download(path);
  if (error) throw new Error(formatSupabaseError(error));
  return data;
}

export async function createSubmission(seasonId, userId, blob, projectJson = null) {
  const sb = await requireClient();
  const subId = crypto.randomUUID();
  const ext = (blob.type || 'audio/mpeg').split('/')[1]?.split(';')[0] || 'mp3';
  const audioPath = `${seasonId}/${subId}.${ext}`;
  await uploadAudioToCloud(audioPath, blob);
  const insertRow = {
    id: subId,
    season_id: seasonId,
    user_id: userId,
    audio_path: audioPath,
  };
  if (projectJson != null) {
    insertRow.project_json = normalizeProjectJsonPayload(projectJson);
  }
  const { data, error } = await sb.from('submissions').insert(insertRow).select().single();
  if (error) throw new Error(formatSupabaseError(error));
  return {
    id: data.id,
    userId: data.user_id,
    audioId: data.audio_path,
    uploadedAt: new Date(data.uploaded_at).getTime(),
    hasProjectJson: data.project_json != null,
  };
}

export async function createReview(seasonId, reviewerId, submissionId, scores) {
  const sb = await requireClient();
  const { data, error } = await sb
    .from('reviews')
    .insert({
      season_id: seasonId,
      reviewer_id: reviewerId,
      submission_id: submissionId,
      scores,
      total_avg: averageScores(scores),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSeasonPhase(seasonId, phase) {
  const sb = await requireClient();
  const patch = { phase };
  const now = new Date().toISOString();
  if (phase === 'revealed') {
    patch.ended_at = now;
    patch.revealed_at = now;
  }
  const { error } = await sb.from('seasons').update(patch).eq('id', seasonId);
  if (error) throw error;
}

export async function updateSeasonRulesRemote(seasonId, rules) {
  const sb = await requireClient();
  const { error } = await sb
    .from('seasons')
    .update({ rules: normalizeRules(rules) })
    .eq('id', seasonId);
  if (error) throw error;
}

export async function joinSeasonParticipantRemote(seasonId, userId) {
  const sb = await requireClient();
  try {
    const { data: row, error: fetchErr } = await sb
      .from('seasons')
      .select('participant_ids')
      .eq('id', seasonId)
      .single();
    if (fetchErr) {
      if (fetchErr.message?.includes('participant_ids')) return;
      throw fetchErr;
    }
    const ids = new Set(row?.participant_ids || []);
    ids.add(userId);
    const { error } = await sb
      .from('seasons')
      .update({ participant_ids: [...ids] })
      .eq('id', seasonId);
    if (error && !error.message?.includes('participant_ids')) throw error;
  } catch (err) {
    console.warn('joinSeasonParticipantRemote', err);
  }
}

export async function startNewSeason(currentSeasonId) {
  const sb = await requireClient();
  const { data: cur } = await sb.from('seasons').select('rules').eq('id', currentSeasonId).single();
  const now = new Date().toISOString();
  await sb
    .from('seasons')
    .update({ phase: 'revealed', ended_at: now, revealed_at: now })
    .eq('id', currentSeasonId);
  const nextId = currentSeasonId + 1;
  await sb.from('seasons').upsert({
    id: nextId,
    phase: 'register',
    rules: cur?.rules || normalizeRules(DEFAULT_SEASON_RULES),
    participant_ids: [],
  });
  return nextId;
}

export function subscribeSeasonChanges(onChange) {
  const sb = getClient();
  if (!sb) return () => {};
  if (!sb) return () => {};
  if (unsubscribe) unsubscribe();

  const channel = sb
    .channel('beat-battle-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seasons' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, onChange)
    .subscribe();

  unsubscribe = () => {
    sb.removeChannel(channel);
    unsubscribe = null;
  };
  return unsubscribe;
}

export function setCurrentUserId(userId) {
  if (userId) localStorage.setItem('beat-battle-current-user-id', userId);
  else localStorage.removeItem('beat-battle-current-user-id');
}

export function getPublicAudioUrl(path) {
  if (!path) return '';
  const sb = getClient();
  if (!sb) return '';
  const { data } = sb.storage.from('audio').getPublicUrl(path);
  return data?.publicUrl || '';
}
