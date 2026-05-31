-- Supabase Storage：audio 桶策略（SQL Editor 执行）
-- 前提：已创建 Public bucket，名称 audio

-- 公开读取（试听、评阅播放）
drop policy if exists "audio_public_read" on storage.objects;
create policy "audio_public_read"
  on storage.objects for select
  using (bucket_id = 'audio');

-- 匿名上传（发布作品、提交参赛）
drop policy if exists "audio_anon_insert" on storage.objects;
create policy "audio_anon_insert"
  on storage.objects for insert
  with check (bucket_id = 'audio');

-- 匿名更新（upsert 覆盖）
drop policy if exists "audio_anon_update" on storage.objects;
create policy "audio_anon_update"
  on storage.objects for update
  using (bucket_id = 'audio');

-- 服务端复制（制作库 → 赛季目录，可选）
drop policy if exists "audio_anon_copy" on storage.objects;
create policy "audio_anon_copy"
  on storage.objects for all
  using (bucket_id = 'audio')
  with check (bucket_id = 'audio');
