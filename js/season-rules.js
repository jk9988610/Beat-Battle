/** 赛季人数门槛与阶段推进规则 */

export const DEFAULT_SEASON_RULES = {
  /** 至少多少人参评（加入本赛季）才可进入评阅 */
  minParticipants: 3,
  /** 至少多少首作品才可进入评阅 */
  minSubmissions: 3,
  /** 是否根据人数/评阅完成情况自动推进阶段 */
  autoProgress: true,
  /** 公布成绩后多少秒自动结束赛季并开启下一季 */
  newSeasonDelaySec: 15,
};

const LS_SEASON_RULES_DEFAULT = 'beat-battle-season-rules-default';

export function getDefaultSeasonRulesTemplate() {
  try {
    const raw = localStorage.getItem(LS_SEASON_RULES_DEFAULT);
    if (raw) return { ...DEFAULT_SEASON_RULES, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SEASON_RULES };
}

export function setDefaultSeasonRulesTemplate(rules) {
  const merged = normalizeRules({ ...getDefaultSeasonRulesTemplate(), ...rules });
  localStorage.setItem(LS_SEASON_RULES_DEFAULT, JSON.stringify(merged));
  return merged;
}

export function normalizeRules(rules = {}) {
  return {
    minParticipants: Math.max(1, Number(rules.minParticipants) || DEFAULT_SEASON_RULES.minParticipants),
    minSubmissions: Math.max(1, Number(rules.minSubmissions) || DEFAULT_SEASON_RULES.minSubmissions),
    autoProgress: rules.autoProgress !== false,
    newSeasonDelaySec: Math.max(
      0,
      Number(rules.newSeasonDelaySec ?? DEFAULT_SEASON_RULES.newSeasonDelaySec)
    ),
  };
}

export function normalizeSeason(season) {
  if (!season.participantIds) season.participantIds = [];
  season.rules = normalizeRules(season.rules || getDefaultSeasonRulesTemplate());
  if (season.revealedAt == null) season.revealedAt = null;
  return season;
}

export function getSeasonRules(season) {
  return normalizeRules(season?.rules || getDefaultSeasonRulesTemplate());
}

export function registerSeasonParticipant(season, userId) {
  normalizeSeason(season);
  if (!userId) return false;
  if (!season.participantIds.includes(userId)) {
    season.participantIds.push(userId);
    return true;
  }
  return false;
}

export function countParticipants(season) {
  return (season.participantIds || []).length;
}

export function countSubmissions(season) {
  return Object.keys(season.submissions || {}).length;
}

/** 每名参赛者需评阅除自己作品外的所有作品 */
export function allSubmissionsFullyReviewed(season) {
  const subs = Object.values(season.submissions || {});
  const participants = season.participantIds || [];
  if (!subs.length || participants.length < 2) return false;

  for (const sub of subs) {
    const requiredReviewers = participants.filter((id) => id !== sub.userId);
    for (const reviewerId of requiredReviewers) {
      const ok = (season.reviews || []).some(
        (r) => r.reviewerId === reviewerId && r.submissionId === sub.id
      );
      if (!ok) return false;
    }
  }
  return true;
}

export function getSeasonStats(season) {
  normalizeSeason(season);
  const rules = getSeasonRules(season);
  const participants = countParticipants(season);
  const submissions = countSubmissions(season);
  const allReviewed = allSubmissionsFullyReviewed(season);

  const canStartReview =
    participants >= rules.minParticipants && submissions >= rules.minSubmissions;

  let reviewProgress = { done: 0, total: 0 };
  const subs = Object.values(season.submissions || {});
  const ids = season.participantIds || [];
  for (const sub of subs) {
    const required = ids.filter((id) => id !== sub.userId).length;
    const done = (season.reviews || []).filter(
      (r) => r.submissionId === sub.id && ids.includes(r.reviewerId) && r.reviewerId !== sub.userId
    ).length;
    reviewProgress.total += required;
    reviewProgress.done += done;
  }

  const revealedAt = season.revealedAt || null;
  const delayMs = rules.newSeasonDelaySec * 1000;
  const shouldEndSeason =
    season.phase === 'revealed' &&
    revealedAt != null &&
    (rules.newSeasonDelaySec === 0 || Date.now() - revealedAt >= delayMs);

  return {
    participants,
    submissions,
    rules,
    canStartReview,
    allReviewed,
    reviewProgress,
    revealedAt,
    shouldEndSeason,
    newSeasonInSec:
      season.phase === 'revealed' && revealedAt != null && rules.newSeasonDelaySec > 0
        ? Math.max(0, Math.ceil((delayMs - (Date.now() - revealedAt)) / 1000))
        : 0,
  };
}

export function canUploadInPhase(phase) {
  return phase === 'register' || phase === 'upload';
}

export function formatSeasonProgressHtml(season) {
  const s = getSeasonStats(season);
  const { rules } = s;
  let lines = [];

  if (season.phase === 'register' || season.phase === 'upload') {
    lines = [
      `<li>已报名 <strong>${s.participants}</strong> / ${rules.minParticipants} 人 <span class="muted">（报名后即可上传，无需等人齐）</span></li>`,
      `<li>已提交作品 <strong>${s.submissions}</strong> / ${rules.minSubmissions} 首</li>`,
      `<li>评阅开启条件：${s.canStartReview ? '✅ 已满足，将自动进入评阅' : '⏳ 未满足'}</li>`,
    ];
  } else if (season.phase === 'review') {
    lines = [
      `<li>评阅进度 <strong>${s.reviewProgress.done}</strong> / ${s.reviewProgress.total}</li>`,
      `<li>${s.allReviewed ? '✅ 全部评完，将自动公布成绩' : '⏳ 尚有未完成的评阅'}</li>`,
    ];
  } else if (season.phase === 'revealed') {
    if (rules.autoProgress && rules.newSeasonDelaySec > 0 && s.newSeasonInSec > 0) {
      lines = [`<li>约 <strong>${s.newSeasonInSec}</strong> 秒后自动开启下一赛季</li>`];
    } else if (rules.autoProgress) {
      lines = [`<li>即将自动开启下一赛季…</li>`];
    }
  }

  if (!lines.length) return '';
  return `<ul class="season-progress-list">${lines.join('')}</ul>`;
}
