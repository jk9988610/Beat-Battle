/**
 * 仅用 fetch 访问 Supabase REST，不依赖 @supabase/supabase-js CDN（避免模块无法启动）
 */
import { getCloudConfig, isCloudEnabled } from './config.js';
import { DEFAULT_SEASON_RULES, normalizeRules } from './season-rules.js';

function defaultState() {
  return {
    currentSeasonId: 1,
    phase: 'register',
    currentUserId: null,
    users: {},
    seasons: {},
  };
}

function headers() {
  const { anonKey } = getCloudConfig();
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };
}

function apiBase() {
  return `${getCloudConfig().url.replace(/\/$/, '')}/rest/v1`;
}

async function restGet(pathQuery) {
  const res = await fetch(`${apiBase()}${pathQuery}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`云同步 HTTP ${res.status}: ${text.slice(0, 180)}`);
  }
  return res.json();
}

export async function fetchRemoteStateRest() {
  if (!isCloudEnabled()) return null;

  const seasonRows = await restGet('/seasons?select=*&order=id.desc');
  const userRows = await restGet('/users?select=*');

  const state = defaultState();
  const users = {};
  for (const u of userRows || []) {
    users[u.id] = { id: u.id, name: u.name, joinedAt: new Date(u.created_at).getTime() };
  }
  state.users = users;

  const rows = seasonRows?.length ? seasonRows : [{ id: 1, phase: 'register', started_at: new Date().toISOString() }];

  const currentId = rows[0].id;
  state.currentSeasonId = currentId;
  state.phase = rows.find((s) => s.id === currentId)?.phase || 'register';

  for (const row of rows) {
    const sid = String(row.id);
    const subs = await restGet(`/submissions?select=*&season_id=eq.${row.id}`);
    const revs = await restGet(`/reviews?select=*&season_id=eq.${row.id}`);

    const submissions = {};
    for (const s of subs || []) {
      submissions[s.id] = {
        id: s.id,
        userId: s.user_id,
        audioId: s.audio_path,
        uploadedAt: new Date(s.uploaded_at).getTime(),
        hasProjectJson: s.project_json != null,
        projectJson: s.project_json ?? null,
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
