/** Supabase 配置：复制 config.example.js 或在评阅站「云同步设置」中填写 */
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
  return {
    url: '',
    anonKey: '',
  };
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
