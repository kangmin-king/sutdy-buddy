-- 학생이 공부 중에 자기가 고른 허용앱을 쓴 시간 구간.
-- 어떤 앱이었는지는 저장하지 않는다 — 매니저에게 필요한 신호는 "얼마나 오래"이지
-- "무엇을"이 아니고, 저장하지 않으면 새어 나갈 것도 없다.
create table sb_allowed_app_intervals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null
);
alter table sb_allowed_app_intervals enable row level security;

create policy "student manages own allowed app intervals" on sb_allowed_app_intervals for all using (
  auth.uid() = user_id
) with check (
  auth.uid() = user_id
);

create policy "linked manager reads allowed app intervals" on sb_allowed_app_intervals for select using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_allowed_app_intervals.user_id and l.manager_id = auth.uid())
);

-- 한 학생이 같은 시각에 두 번 허용앱에 들어갈 수 없으므로 (user_id, started_at)이 자연 키다.
-- 웹이 on conflict do nothing으로 넣으면 전송을 재시도해도 행이 늘지 않는다.
create unique index sb_allowed_app_intervals_user_started_idx
  on sb_allowed_app_intervals (user_id, started_at);
