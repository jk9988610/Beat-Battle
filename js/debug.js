import { getVersionMeta } from './version.js';
import { isCloudEnabled, getCloudConfig, hasBuiltInCloudConfig } from './config.js';
import { cloudActive } from './remote.js';

function maskKey(key) {
  if (!key || key.length < 12) return '(未配置)';
  return `${key.slice(0, 8)}…${key.slice(-6)}`;
}

export function collectDebugInfo(state) {
  const meta = getVersionMeta();
  const cfg = getCloudConfig();
  const season = state?.seasons?.[String(state?.currentSeasonId)];

  return {
    app: meta.name,
    version: meta.version,
    build: meta.build,
    collectedAt: new Date().toISOString(),
    pageUrl: location.href,
    route: location.hash || '#home',
    cloud: {
      enabled: isCloudEnabled(),
      active: cloudActive(),
      builtInConfig: hasBuiltInCloudConfig(),
      projectUrl: cfg.url || null,
      anonKeyPreview: maskKey(cfg.anonKey),
    },
    session: {
      currentUserId: state?.currentUserId ?? null,
      userName: state?.currentUserId ? state.users[state.currentUserId]?.name : null,
      currentSeasonId: state?.currentSeasonId ?? null,
      phase: season?.phase ?? state?.phase ?? null,
      submissionsCount: season ? Object.keys(season.submissions || {}).length : 0,
      reviewsCount: season?.reviews?.length ?? 0,
    },
    environment: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
    },
  };
}

export function formatDebugText(info) {
  const lines = [
    `=== ${info.app} 调试信息 ===`,
    `版本: ${info.version}`,
    `构建: ${info.build}`,
    `采集时间: ${info.collectedAt}`,
    `页面: ${info.pageUrl}`,
    `路由: ${info.route}`,
    '',
    '[云同步]',
    `  已配置: ${info.cloud.enabled}`,
    `  已连接: ${info.cloud.active}`,
    `  内置配置: ${info.cloud.builtInConfig}`,
    `  Project URL: ${info.cloud.projectUrl || '(无)'}`,
    `  anon key: ${info.cloud.anonKeyPreview}`,
    '',
    '[当前会话]',
    `  用户: ${info.session.userName || '(未登录)'} (${info.session.currentUserId || '-'})`,
    `  赛季: S${info.session.currentSeasonId} · 阶段 ${info.session.phase}`,
    `  作品数: ${info.session.submissionsCount} · 评分数: ${info.session.reviewsCount}`,
    '',
    '[环境]',
    `  在线: ${info.environment.online}`,
    `  语言: ${info.environment.language}`,
    `  UA: ${info.environment.userAgent}`,
    '',
    '--- JSON ---',
    JSON.stringify(info, null, 2),
  ];
  return lines.join('\n');
}

export async function copyDebugInfo(state) {
  const info = collectDebugInfo(state);
  const text = formatDebugText(info);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  return info;
}
