-- ============================================================
--  커뮤니티 댓글 (post_comments) — Supabase SQL Editor에서 실행
-- ============================================================

create table if not exists public.post_comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid        not null references public.community_posts(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  author_name  text        not null default '익명',
  body         text        not null,
  created_at   timestamptz not null default now()
);

create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

drop policy if exists post_comments_select on public.post_comments;
drop policy if exists post_comments_insert on public.post_comments;
drop policy if exists post_comments_delete on public.post_comments;

create policy post_comments_select on public.post_comments
  for select to authenticated using (true);

create policy post_comments_insert on public.post_comments
  for insert to authenticated with check (auth.uid() = user_id);

create policy post_comments_delete on public.post_comments
  for delete to authenticated using (auth.uid() = user_id);
