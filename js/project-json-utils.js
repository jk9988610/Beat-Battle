/** 编曲工程 JSON（HarmonyForge .hfproj / bundle）解析与校验 */

export const MAX_PROJECT_JSON_BYTES = 2 * 1024 * 1024;

/**
 * 从 File 读取并解析为可写入 jsonb 的对象（保留完整 bundle 或裸 project）
 */
export async function parseProjectJsonFile(file) {
  if (!file) return null;
  const name = (file.name || '').toLowerCase();
  if (!name.endsWith('.json') && !name.endsWith('.hfproj')) {
    throw new Error('编曲工程须为 .json 或 .hfproj 文件');
  }
  if (file.size > MAX_PROJECT_JSON_BYTES) {
    throw new Error(`编曲 JSON 过大（上限 ${Math.round(MAX_PROJECT_JSON_BYTES / 1024 / 1024)}MB）`);
  }
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON 解析失败，请确认是 HarmonyForge 导出的工程文件');
  }
  return normalizeProjectJsonPayload(parsed);
}

/**
 * @param {object} data — buildBundle 结果或含 sequencer/arranger 的 project
 */
export function normalizeProjectJsonPayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('编曲工程内容无效');
  }
  if (data.harmonyforge != null && data.project) {
    return data;
  }
  if (data.sequencer || data.arranger) {
    return { harmonyforge: 2, kind: 'project', project: data };
  }
  throw new Error('不是有效的 HarmonyForge 编曲工程');
}

export function projectJsonFromProduction(project, meta = {}) {
  if (!project || typeof project !== 'object') {
    throw new Error('缺少编曲工程数据');
  }
  return normalizeProjectJsonPayload({
    harmonyforge: 2,
    kind: 'project',
    meta: { exportedAt: new Date().toISOString(), ...meta },
    project,
  });
}
