-- 赛季人数门槛与参赛者（在 schema.sql 已执行后追加运行）

alter table seasons
  add column if not exists rules jsonb not null default '{
    "minParticipants": 3,
    "minSubmissions": 3,
    "autoProgress": true,
    "autoNewSeason": false,
    "newSeasonDelaySec": 15
  }'::jsonb;

alter table seasons
  add column if not exists participant_ids uuid[] not null default '{}';

alter table seasons
  add column if not exists revealed_at timestamptz;

comment on column seasons.rules is '赛季规则：minParticipants, minSubmissions, autoProgress, autoNewSeason, newSeasonDelaySec';
comment on column seasons.participant_ids is '本赛季已报名用户 id 列表';
