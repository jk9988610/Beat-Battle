/**
 * Supabase 云同步（已预置本项目，打开评阅站即可自动连接）
 * 仅使用 anon public key；切勿写入 service_role / Secret key
 */
export const DEFAULT_CLOUD_CONFIG = {
  url: 'https://yjqkotqmglxjhlrhynsu.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqcWtvdHFtZ2x4amhscmh5bnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxOTMzNDQsImV4cCI6MjA5NTc2OTM0NH0.Cm4WjiR4NXS4RrA15frLVMZPbGUyGyjaIYQXSRua8Ew',
};

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
