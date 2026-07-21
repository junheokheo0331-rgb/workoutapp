-- ============================================================
--  Autoreg — Supabase 스키마
--  Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하면 된다.
--  RLS로 사용자별 격리를 강제하므로, 여러 명이 같은 앱을 써도
--  다른 사람의 루틴·기준기록·훈련로그를 절대 볼 수 없다.
-- ============================================================

-- ── 1. 설정 + 루틴 템플릿 (사용자당 1행) ─────────────────────
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── 2. 날짜별 훈련 로그 (사용자 × 날짜당 1행) ────────────────
--    날짜 단위로 행을 나누면 기기를 두 대 써도 다른 날짜끼리는
--    충돌하지 않고, 기록이 쌓여도 한 행이 비대해지지 않는다.
create table if not exists public.workout_logs (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  log_date   date        not null,
  payload    jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

create index if not exists workout_logs_user_date_idx
  on public.workout_logs (user_id, log_date desc);

-- ── 3. RLS 활성화 ───────────────────────────────────────────
alter table public.user_state   enable row level security;
alter table public.workout_logs enable row level security;

-- ── 4. 정책: 본인 행만 읽고 쓴다 ────────────────────────────
drop policy if exists user_state_select on public.user_state;
drop policy if exists user_state_insert on public.user_state;
drop policy if exists user_state_update on public.user_state;
drop policy if exists user_state_delete on public.user_state;

create policy user_state_select on public.user_state
  for select using (auth.uid() = user_id);
create policy user_state_insert on public.user_state
  for insert with check (auth.uid() = user_id);
create policy user_state_update on public.user_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_state_delete on public.user_state
  for delete using (auth.uid() = user_id);

drop policy if exists workout_logs_select on public.workout_logs;
drop policy if exists workout_logs_insert on public.workout_logs;
drop policy if exists workout_logs_update on public.workout_logs;
drop policy if exists workout_logs_delete on public.workout_logs;

create policy workout_logs_select on public.workout_logs
  for select using (auth.uid() = user_id);
create policy workout_logs_insert on public.workout_logs
  for insert with check (auth.uid() = user_id);
create policy workout_logs_update on public.workout_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy workout_logs_delete on public.workout_logs
  for delete using (auth.uid() = user_id);

-- ── 5. (선택) 서버 시각으로 updated_at 강제 ─────────────────
--    앱은 로컬 시계로 updated_at을 보내는데, 기기 시계가 틀어져 있으면
--    병합이 어긋날 수 있다. 아래 트리거를 켜면 서버 시각으로 통일된다.
--    단, 오프라인에서 오래 전에 만든 기록이 "방금 것"으로 취급되므로
--    기기를 한 대만 쓴다면 켜지 않아도 된다.
--
-- create or replace function public.touch_updated_at()
-- returns trigger language plpgsql as $$
-- begin new.updated_at = now(); return new; end $$;
--
-- create trigger user_state_touch   before insert or update on public.user_state
--   for each row execute function public.touch_updated_at();
-- create trigger workout_logs_touch before insert or update on public.workout_logs
--   for each row execute function public.touch_updated_at();

-- ── 6. 이메일 확인 끄기 ─────────────────────────────────────
--    이름 기반 가상 이메일([이름]@workout.app)을 쓰므로 확인 메일을
--    받을 수 없다. 반드시 아래를 설정해야 회원가입이 즉시 완료된다.
--
--    Authentication → Providers → Email
--      · "Confirm email"  OFF
--      · "Enable email provider" ON
