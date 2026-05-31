import {
  getClient,
  uploadAudioToCloud,
  downloadAudioFromCloud,
  getPublicAudioUrl,
} from './remote.js';

function mapRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    title: row.title,
    audioPath: row.audio_path,
    publishedAt: new Date(row.published_at).getTime(),
    audioUrl: getPublicAudioUrl(row.audio_path),
  };
}

export async function listPublishedWorks(userId) {
  const sb = getClient();
  if (!sb || !userId) return [];
  const { data, error } = await sb
    .from('published_works')
    .select('*')
    .eq('user_id', userId)
    .order('published_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapRow);
}

export async function publishWork({ userId, userName, title, audioBlob }) {
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
  if (error) throw error;
  return mapRow(data);
}

export async function createSubmissionFromPublished(seasonId, userId, work) {
  const sb = getClient();
  if (!sb) throw new Error('云同步未配置');
  if (!work?.audioPath) throw new Error('无效的制作库作品');

  const subId = crypto.randomUUID();
  const ext = work.audioPath.split('.').pop() || 'mp3';
  const destPath = `${seasonId}/${subId}.${ext}`;
  const blob = await downloadAudioFromCloud(work.audioPath);
  await uploadAudioToCloud(destPath, blob);

  const { data, error } = await sb
    .from('submissions')
    .insert({
      id: subId,
      season_id: seasonId,
      user_id: userId,
      audio_path: destPath,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    userId: data.user_id,
    audioId: data.audio_path,
    uploadedAt: new Date(data.uploaded_at).getTime(),
  };
}
