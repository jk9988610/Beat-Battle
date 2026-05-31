-- 参赛作品附带编曲工程 JSON（在 schema-v4-project-json.sql 之后执行）

alter table submissions
  add column if not exists project_json jsonb;

comment on column submissions.project_json is '编曲工程 JSON（HarmonyForge bundle），评阅仍用音频';
