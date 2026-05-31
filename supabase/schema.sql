-- Beat Battle 云同步（Supabase SQL Editor 中执行）
-- 1. Storage → New bucket：名称 audio，勾选 Public bucket
-- 2. 在 SQL Editor 运行本文件

create table if not exists seasons (
  id bigint primary key,
  phase text not null default 'register',
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists users_name_lower_idx on users (lower(name));

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  season_id bigint not null references seasons(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  audio_path text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  season_id bigint not null references seasons(id) on delete cascade,
  reviewer_id uuid not null references users(id) on delete cascade,
  submission_id uuid not null references submissions(id) on delete cascade,
  scores jsonb not null,
  total_avg numeric,
  reviewed_at timestamptz not null default now(),
  unique (reviewer_id, submission_id)
);

insert into seasons (id, phase) values (1, 'register') on conflict (id) do nothing;

alter table seasons enable row level security;
alter table users enable row level security;
alter table submissions enable row level security;
alter table reviews enable row level security;

create policy "seasons_all" on seasons for all using (true) with check (true);
create policy "users_all" on users for all using (true) with check (true);
create policy "submissions_all" on submissions for all using (true) with check (true);
create policy "reviews_all" on reviews for all using (true) with check (true);

-- Storage policies（bucket 名 audio，需在 Dashboard 创建 bucket 后执行）
-- create policy "audio_public_read" on storage.objects for select using (bucket_id = 'audio');
-- create policy "audio_anon_insert" on storage.objects for insert with check (bucket_id = 'audio');
