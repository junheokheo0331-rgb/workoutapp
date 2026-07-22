-- ============================================================
--  커뮤니티 글 삭제 안 됨 → RLS DELETE 정책 누락 패치
--  Supabase SQL Editor에 이 파일만 붙여넣고 실행하면 됩니다.
-- ============================================================

-- 기존 이름 다른 정책도 정리
drop policy if exists "Everyone can view posts" on public.community_posts;
drop policy if exists "Authenticated users can insert posts" on public.community_posts;
drop policy if exists "Users can delete own posts" on public.community_posts;
drop policy if exists community_posts_select on public.community_posts;
drop policy if exists community_posts_insert on public.community_posts;
drop policy if exists community_posts_delete on public.community_posts;
drop policy if exists community_posts_update on public.community_posts;

-- 조회: 로그인 유저 전원
create policy community_posts_select on public.community_posts
  for select to authenticated
  using (true);

-- 작성: 본인 user_id 로만
create policy community_posts_insert on public.community_posts
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ★ 삭제: 본인 글만 (이게 없어서 삭제가 0건으로 막힘)
create policy community_posts_delete on public.community_posts
  for delete to authenticated
  using (auth.uid() = user_id);

-- (선택) 본인 글 수정
create policy community_posts_update on public.community_posts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 반응 정책도 본인 것만 쓰도록 정리 (전원 authenticated all 은 과도함)
drop policy if exists "Everyone can view reactions" on public.post_reactions;
drop policy if exists "Authenticated users can react" on public.post_reactions;
drop policy if exists post_reactions_select on public.post_reactions;
drop policy if exists post_reactions_insert on public.post_reactions;
drop policy if exists post_reactions_update on public.post_reactions;
drop policy if exists post_reactions_delete on public.post_reactions;

create policy post_reactions_select on public.post_reactions
  for select to authenticated using (true);
create policy post_reactions_insert on public.post_reactions
  for insert to authenticated with check (auth.uid() = user_id);
create policy post_reactions_delete on public.post_reactions
  for delete to authenticated using (auth.uid() = user_id);
