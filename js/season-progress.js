import { getCurrentSeason, ensureSeason } from './storage.js';
import {
  getSeasonStats,
  getSeasonRules,
  normalizeSeason,
  registerSeasonParticipant,
} from './season-rules.js';
import { updateSeasonPhase, startNewSeason, cloudActive } from './remote.js';

const NOTIFY_KEY = 'beat-battle-phase-notify';

function notifiedKey(seasonId, tag) {
  return `${NOTIFY_KEY}-${seasonId}-${tag}`;
}

function markNotified(seasonId, tag) {
  try {
    sessionStorage.setItem(notifiedKey(seasonId, tag), '1');
  } catch {
    /* ignore */
  }
}

function wasNotified(seasonId, tag) {
  try {
    return sessionStorage.getItem(notifiedKey(seasonId, tag)) === '1';
  } catch {
    return false;
  }
}

async function setPhase(state, season, phase) {
  if (cloudActive()) {
    await updateSeasonPhase(state.currentSeasonId, phase);
  } else {
    season.phase = phase;
    state.phase = phase;
    if (phase === 'revealed' && !season.endedAt) {
      season.endedAt = Date.now();
    }
  }
}

/**
 * 检测并执行自动阶段推进
 * @returns {{ changed: boolean, message?: string, phase?: string, newSeasonId?: number }}
 */
export async function maybeAutoProgressSeason(state, { saveState }) {
  const season = getCurrentSeason(state);
  normalizeSeason(season);
  const rules = getSeasonRules(season);
  if (!rules.autoProgress) return { changed: false };

  const stats = getSeasonStats(season);
  const sid = state.currentSeasonId;

  if ((season.phase === 'register' || season.phase === 'upload') && stats.canStartReview) {
    const tag = `review-${sid}`;
    await setPhase(state, season, 'review');
    if (!cloudActive()) saveState?.(state);
    const message = `已满足参赛 ${rules.minParticipants} 人、作品 ${rules.minSubmissions} 首，赛季自动进入评阅阶段`;
    if (!wasNotified(sid, tag)) {
      markNotified(sid, tag);
      return { changed: true, phase: 'review', message };
    }
    return { changed: true, phase: 'review' };
  }

  if (season.phase === 'review' && stats.allReviewed && stats.submissions > 0) {
    const tag = `revealed-${sid}`;
    season.revealedAt = Date.now();
    if (!season.endedAt) season.endedAt = season.revealedAt;
    await setPhase(state, season, 'revealed');
    if (!cloudActive()) saveState?.(state);
    const message = '所有作品已评阅完毕，赛季自动进入公布成绩阶段';
    if (!wasNotified(sid, tag)) {
      markNotified(sid, tag);
      return { changed: true, phase: 'revealed', message };
    }
    return { changed: true, phase: 'revealed' };
  }

  if (season.phase === 'revealed') {
    if (!season.revealedAt) season.revealedAt = Date.now();
    const stats2 = getSeasonStats(season);
    if (stats2.shouldEndSeason) {
      const tag = `newseason-${sid}`;
      let nextId;
      if (cloudActive()) {
        nextId = await startNewSeason(sid);
      } else {
        season.phase = 'revealed';
        if (!season.endedAt) season.endedAt = Date.now();
        nextId = sid + 1;
        const next = ensureSeason(state, nextId);
        next.phase = 'register';
        next.participantIds = [];
        next.rules = { ...rules };
        next.revealedAt = null;
        next.startedAt = Date.now();
        state.currentSeasonId = nextId;
        state.phase = 'register';
      }
      const message = `第 ${sid} 赛季已结束，第 ${nextId} 赛季报名已开始`;
      if (!wasNotified(sid, tag)) {
        markNotified(sid, tag);
        return { changed: true, newSeasonId: nextId, message };
      }
      return { changed: true, newSeasonId: nextId };
    }
  }

  return { changed: false };
}

export function ensureParticipantAndRules(state, userId) {
  const season = getCurrentSeason(state);
  registerSeasonParticipant(season, userId);
  return season;
}

export async function saveSeasonRules(state, rules, { cloudActive: cloud, updateSeasonRulesRemote, saveState }) {
  const season = getCurrentSeason(state);
  season.rules = rules;
  if (cloud && updateSeasonRulesRemote) {
    await updateSeasonRulesRemote(state.currentSeasonId, rules);
  }
  saveState?.(state);
}

export async function saveSeasonParticipant(state, userId, { cloudActive: cloud, joinSeasonParticipantRemote, saveState }) {
  const season = getCurrentSeason(state);
  const added = registerSeasonParticipant(season, userId);
  if (added && cloud && joinSeasonParticipantRemote) {
    await joinSeasonParticipantRemote(state.currentSeasonId, userId);
  }
  saveState?.(state);
  return added;
}
