/** 应用版本信息（deploy 时 workflow 会写入 build） */
let meta = { name: 'Beat Battle', version: '1.3.0', build: 'dev' };

export async function loadVersionMeta() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) meta = { ...meta, ...(await res.json()) };
  } catch {
    /* 使用默认值 */
  }
  return meta;
}

export function getVersionMeta() {
  return { ...meta };
}

export function formatVersionLabel() {
  return `v${meta.version} · ${meta.build}`;
}
