/**
 * Supabase 云同步（已预置本项目，打开评阅站即可自动连接）
 * 仅使用 anon public key；切勿写入 service_role / Secret key
 */
export const DEFAULT_CLOUD_CONFIG = {
  url: 'https://yjqkotqmglxjhlrhynsu.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqcWtvdHFtZ2x4amhscmh5bnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTMzNDQsImV4cCI6MjA5NTc2OTM0NH0.Cm4WjiR4NXS4RrA15frLVMZPbGUyGyjaIYQXSRua8Ew',
};

/**
 * 管理员指定方式（二选一或同时使用）
 * 1. ADMIN_USER_NAMES：用这些昵称「加入本赛季」即为管理员
 * 2. ADMIN_PIN：普通昵称登录后，在主页输入口令可临时获得管理权限（仅当前浏览器标签页）
 *
 * 请修改 ADMIN_PIN，勿使用默认值 bb2026
 */
export const ADMIN_USER_NAMES = ['管理员', '主持人'];
export const ADMIN_PIN = 'bb2026';

export function getCloudConfig() {
  try {
    const raw = localStorage.getItem('beat-battle-cloud-config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.url && parsed?.anonKey) return parsed;
    }
  } catch {
    /* ignore */
  }
  if (DEFAULT_CLOUD_CONFIG.url && DEFAULT_CLOUD_CONFIG.anonKey) {
    return { ...DEFAULT_CLOUD_CONFIG };
  }
  return { url: '', anonKey: '' };
}

export function setCloudConfig({ url, anonKey }) {
  localStorage.setItem(
    'beat-battle-cloud-config',
    JSON.stringify({ url: url?.trim() || '', anonKey: anonKey?.trim() || '' })
  );
}

export function isCloudEnabled() {
  const c = getCloudConfig();
  return Boolean(c.url && c.anonKey);
}

export function hasBuiltInCloudConfig() {
  return Boolean(DEFAULT_CLOUD_CONFIG.url && DEFAULT_CLOUD_CONFIG.anonKey);
}
