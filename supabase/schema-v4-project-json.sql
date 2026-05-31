-- 可选：制作库作品附带工程 JSON（未来 HarmonyForge 同步用）
alter table published_works
  add column if not exists project_json jsonb;

comment on column published_works.project_json is '编曲工程：音序、段落、轨道等（JSON）';
