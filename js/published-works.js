import {
  initCloudAsync,
  getClient,
  uploadAudioToCloud,
  downloadAudioFromCloud,
  getPublicAudioUrl,
  copyAudioInCloud,
} from './remote.js';
import { formatSupabaseError } from './supabase-error.js';

let previewObjectUrl = null;

export function revokeWorkPreviewUrl() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
}

function mapRow(row) {
  const audioPath = row.audio_path;
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    title: row.title,
    audioPath,
    publishedAt: new Date(row.published_at).getTime(),
    audioUrl: getPublicAudioUrl(audioPath),
  };
}

export async function listPublishedWorks(userId) {
  await initCloudAsync();
  const sb = getClient();
  if (!sb || !userId) return [];
  const { data, error } = await sb
    .from('published_works')
    .select('*')
    .eq('user_id', userId)
    .order('published_at', { ascending: false });
  if (error) throw new Error(formatSupabaseError(error));
  return (data || []).map(mapRow);
}

export async function publishWork({ userId, userName, title, audioBlob }) {
  await initCloudAsync();
  const sb = getClient();
  if (!sb) throw new Error('云同步未配置');
  if (!userId || !userName?.trim()) throw new Error('请先登录');
  if (!title?.trim()) throw new Error('请填写作品标题');
  if (!(audioBlob instanceof Blob)) throw new Error('audioBlob 必须是 Blob');

  const workId = crypto.randomUUID();
  const ext = (audioBlob.type || 'audio/mpeg').split('/')[1]?.split(';')[0] || 'mp3';
  const audioPath = `published/${userId}/${workId}.${ext}`;
  await uploadAudioToCloud(audioPath, audioBlob);

  const { data, error } = await sb
    .from('published_works')
    .insert({
      id: workId,
      user_id: userId,
      user_name: userName.trim(),
      title: title.trim(),
      audio_path: audioPath,
    })
    .select()
    .single();
  if (error) throw new Error(formatSupabaseError(error));
  return mapRow(data);
}

/** 公网直链（立即播放，不在此处预检测避免延迟） */
export function getWorkPublicPreviewUrl(work) {
  if (!work?.audioPath) return '';
  return work.audioUrl || getPublicAudioUrl(work.audioPath);
}

/** 下载为 Blob URL（公网失败时回退） */
export async function resolveWorkPreviewBlobUrl(work) {
  if (!work?.audioPath) throw new Error('缺少音频路径');
  const blob = await downloadAudioFromCloud(work.audioPath);
  revokeWorkPreviewUrl();
  previewObjectUrl = URL.createObjectURL(blob);
  return previewObjectUrl;
}

/**
 * 从制作库提交参赛：优先服务端复制，失败则直接引用已有 Storage 路径（避免平板下载再上传）
 */
export async function createSubmissionFromPublished(seasonId, userId, work) {
  await initCloudAsync();
  const sb = getClient();
  if (!sb) throw new Error('云同步未配置');
  const audioPath = work?.audioPath;
  if (!audioPath) throw new Error('无效的制作库作品');

  const subId = crypto.randomUUID();
  const ext = audioPath.split('.').pop() || 'mp3';
  const seasonAudioPath = `${seasonId}/${subId}.${ext}`;

  let finalPath = audioPath;
  try {
    await copyAudioInCloud(audioPath, seasonAudioPath);
    finalPath = seasonAudioPath;
  } catch {
    // 无 copy 权限时直接引用制作库文件，仍可评阅播放
    finalPath = audioPath;
  }

  const { data, error } = await sb
    .from('submissions')
    .insert({
      id: subId,
      season_id: Number(seasonId),
      user_id: userId,
      audio_path: finalPath,
    })
    .select()
    .single();

  if (error) throw new Error(formatSupabaseError(error));

  return {
    id: data.id,
    userId: data.user_id,
    audioId: data.audio_path,
    uploadedAt: new Date(data.uploaded_at).getTime(),
  };
}
