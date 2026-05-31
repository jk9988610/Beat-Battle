/** 将 Supabase / Storage 错误转为可读中文提示 */
export function formatSupabaseError(err) {
  if (!err) return '未知错误';
  const msg = err.message || String(err);
  const status = err.statusCode || err.status;

  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return '网络异常，请检查连接后重试';
  }
  if (status === 401 || msg.includes('JWT')) {
    return '云同步认证失败，请检查 Supabase anon key';
  }
  if (msg.includes('row-level security') || msg.includes('RLS')) {
    return '数据库权限不足，请确认 Supabase 已开启表策略';
  }
  if (msg.includes('Bucket not found') || msg.includes('bucket')) {
    return 'Storage 桶 audio 不存在，请在 Supabase 创建 Public 桶';
  }
  if (msg.includes('new row violates') || msg.includes('violates foreign-key')) {
    return '赛季或用户数据无效，请刷新页面后重新加入本赛季';
  }
  if (msg.includes('duplicate key') || msg.includes('unique')) {
    return '重复提交：你已在本赛季提交过该作品';
  }
  if (msg.includes('not found') && msg.includes('Object')) {
    return '音频文件不存在，请先在编曲站重新发布到制作库';
  }
  if (err.error === 'Unauthorized' || msg.includes('Unauthorized')) {
    return '无权访问音频，请在 Supabase Storage 为 audio 桶添加读取策略';
  }
  return msg;
}
