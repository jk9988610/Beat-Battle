-- Beat Battle 制作库（published_works）— 在 schema.sql 之后于 Supabase SQL Editor 执行
-- Storage：沿用 audio 桶，路径前缀 published/{user_id}/

create table if not exists published_works (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  user_name text not null,
  title text not null,
  audio_path text not null,
  published_at timestamptz not null default now()
);

create index if not exists published_works_user_id_idx on published_works (user_id);
create index if not exists published_works_published_at_idx on published_works (published_at desc);

alter table published_works enable row level security;

drop policy if exists "published_works_all" on published_works;
create policy "published_works_all" on published_works for all using (true) with check (true);
