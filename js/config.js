/**
 * Supabase 云同步（已预置本项目，打开评阅站即可自动连接）
 * 仅使用 anon public key；切勿写入 service_role / Secret key
 */
export const DEFAULT_CLOUD_CONFIG = {
  url: 'https://yjqkotqmglxjhlrhynsu.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqcWtvdHFtZ2x4amhscmh5bnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTMzNDQsImV4cCI6MjA5NTc2OTM0NH0.Cm4WjiR4NXS4RrA15frLVMZPbGUyGyjaIYQXSRua8Ew',
};

/** 默认管理员配置（可在「设置」页修改，保存到本机） */
export const DEFAULT_ADMIN_SETTINGS = {
  userNames: ['管理员'],
  pin: 'bb2026',
};

const LS_ADMIN_SETTINGS = 'beat-battle-admin-settings';

export function getAdminSettings() {
  try {
    const raw = localStorage.getItem(LS_ADMIN_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        userNames: Array.isArray(parsed.userNames)
          ? parsed.userNames.filter(Boolean)
          : [...DEFAULT_ADMIN_SETTINGS.userNames],
        pin: parsed.pin ?? DEFAULT_ADMIN_SETTINGS.pin,
      };
    }
  } catch {
    /* ignore */
  }
  const base = { ...DEFAULT_ADMIN_SETTINGS, userNames: [...DEFAULT_ADMIN_SETTINGS.userNames] };
  if (!base.userNames.some((n) => n.trim() === '管理员')) {
    base.userNames.unshift('管理员');
  }
  return base;
}

export function setAdminSettings({ userNames, pin }) {
  const names = (Array.isArray(userNames) ? userNames : String(userNames).split(/[,，、\n]/))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) throw new Error('至少保留一个管理员昵称');
  if (!pin || !String(pin).trim()) throw new Error('请设置管理员口令');
  localStorage.setItem(
    LS_ADMIN_SETTINGS,
    JSON.stringify({ userNames: names, pin: String(pin).trim() })
  );
}

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
