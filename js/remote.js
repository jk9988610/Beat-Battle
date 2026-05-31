import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
import { getCloudConfig, isCloudEnabled } from './config.js';
import { averageScores } from './scoring.js';
import { DEFAULT_SEASON_RULES, normalizeRules } from './season-rules.js';
import { formatSupabaseError } from './supabase-error.js';

let client = null;
let unsubscribe = null;

export function cloudActive() {
  return isCloudEnabled() && client != null;
}

export function initCloud() {
  if (!isCloudEnabled()) {
    client = null;
    return null;
  }
  const { url, anonKey } = getCloudConfig();
  client = createClient(url, anonKey);
  return client;
}

export function getClient() {
  if (!client && isCloudEnabled()) initCloud();
  return client;
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
  const sb = getClient();
  if (!sb) return null;

  const { data: seasonRows, error: sErr } = await sb
    .from('seasons')
    .select('*')
    .order('id', { ascending: false });
  if (sErr) throw sErr;

  const { data: userRows, error: uErr } = await sb.from('users').select('*');
  if (uErr) throw uErr;

  const state = defaultState();
  const users = {};
  for (const u of userRows || []) {
    users[u.id] = { id: u.id, name: u.name, joinedAt: new Date(u.created_at).getTime() };
  }
  state.users = users;

  if (!seasonRows?.length) {
    await sb.from('seasons').upsert({ id: 1, phase: 'register' });
    seasonRows.push({ id: 1, phase: 'register', started_at: new Date().toISOString() });
  }

  const currentId = seasonRows[0].id;
  state.currentSeasonId = currentId;
  state.phase = seasonRows.find((s) => s.id === currentId)?.phase || 'register';

  for (const row of seasonRows) {
    const sid = String(row.id);
    const { data: subs } = await sb
      .from('submissions')
      .select('*')
      .eq('season_id', row.id);
    const { data: revs } = await sb.from('reviews').select('*').eq('season_id', row.id);

    const submissions = {};
    for (const s of subs || []) {
      submissions[s.id] = {
        id: s.id,
        userId: s.user_id,
        audioId: s.audio_path,
        uploadedAt: new Date(s.uploaded_at).getTime(),
      };
    }

    state.seasons[sid] = {
      id: row.id,
      phase: row.phase,
      startedAt: new Date(row.started_at).getTime(),
      endedAt: row.ended_at ? new Date(row.ended_at).getTime() : null,
      revealedAt: row.revealed_at ? new Date(row.revealed_at).getTime() : null,
      participantIds: Array.isArray(row.participant_ids) ? [...row.participant_ids] : [],
      rules: normalizeRules(row.rules || DEFAULT_SEASON_RULES),
      submissions,
      reviews: (revs || []).map((r) => ({
        id: r.id,
        reviewerId: r.reviewer_id,
        submissionId: r.submission_id,
        scores: r.scores,
        totalAvg: r.total_avg,
        reviewedAt: new Date(r.reviewed_at).getTime(),
      })),
    };
  }

  const savedUserId = localStorage.getItem('beat-battle-current-user-id');
  if (savedUserId && users[savedUserId]) state.currentUserId = savedUserId;

  return state;
}

export async function ensureRemoteSeason(seasonId) {
  const sb = getClient();
  await sb.from('seasons').upsert({ id: seasonId, phase: 'register' });
}

export async function findOrCreateUser(name) {
  const sb = getClient();
  const trimmed = name.trim();
  const { data: existing } = await sb.from('users').select('*').eq('name', trimmed).maybeSingle();
  if (existing) return existing;

  const { data, error } = await sb.from('users').insert({ name: trimmed }).select().single();
  if (error) throw error;
  return data;
}

export async function uploadAudioToCloud(path, blob) {
  const sb = getClient();
  const { error } = await sb.storage.from('audio').upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'audio/mpeg',
  });
  if (error) throw new Error(formatSupabaseError(error));
  return path;
}

export async function copyAudioInCloud(fromPath, toPath) {
  const sb = getClient();
  const { error } = await sb.storage.from('audio').copy(fromPath, toPath);
  if (error) throw error;
  return toPath;
}

export async function downloadAudioFromCloud(path) {
  const sb = getClient();
  const { data, error } = await sb.storage.from('audio').download(path);
  if (error) throw new Error(formatSupabaseError(error));
  return data;
}

export async function createSubmission(seasonId, userId, blob) {
  const sb = getClient();
  const subId = crypto.randomUUID();
  const ext = (blob.type || 'audio/mpeg').split('/')[1]?.split(';')[0] || 'mp3';
  const audioPath = `${seasonId}/${subId}.${ext}`;
  await uploadAudioToCloud(audioPath, blob);
  const { data, error } = await sb
    .from('submissions')
    .insert({
      id: subId,
      season_id: seasonId,
      user_id: userId,
      audio_path: audioPath,
    })
    .select()
    .single();
  if (error) throw new Error(formatSupabaseError(error));
  return {
    id: data.id,
    userId: data.user_id,
    audioId: data.audio_path,
    uploadedAt: new Date(data.uploaded_at).getTime(),
  };
}

export async function createReview(seasonId, reviewerId, submissionId, scores) {
  const sb = getClient();
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
  const sb = getClient();
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
  const sb = getClient();
  const { error } = await sb
    .from('seasons')
    .update({ rules: normalizeRules(rules) })
    .eq('id', seasonId);
  if (error) throw error;
}

export async function joinSeasonParticipantRemote(seasonId, userId) {
  const sb = getClient();
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
  const sb = getClient();
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
