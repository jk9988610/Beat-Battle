import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
import { getCloudConfig, isCloudEnabled } from './config.js';
import { averageScores } from './scoring.js';

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
  if (error) throw error;
  return path;
}

export async function downloadAudioFromCloud(path) {
  const sb = getClient();
  const { data, error } = await sb.storage.from('audio').download(path);
  if (error) throw error;
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
  if (error) throw error;
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
  if (phase === 'revealed') patch.ended_at = new Date().toISOString();
  const { error } = await sb.from('seasons').update(patch).eq('id', seasonId);
  if (error) throw error;
}

export async function startNewSeason(currentSeasonId) {
  const sb = getClient();
  await updateSeasonPhase(currentSeasonId, 'revealed');
  const nextId = currentSeasonId + 1;
  await sb.from('seasons').upsert({ id: nextId, phase: 'register' });
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
