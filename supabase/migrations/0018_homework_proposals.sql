-- 선생님이 "이 날짜에 이 숙제 어때요?" 하고 제안하면 학생이 수락/거절하는 흐름. 수락하면
-- 그 자리에서 sb_planner_items에 실제 숙제 항목으로 들어간다(클라이언트에서 처리) — 이 테이블
-- 자체는 제안 상태만 들고 있는다.
create table sb_homework_proposals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  subject_id text not null,
  material text not null default '',
  page_range text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
alter table sb_homework_proposals enable row level security;

-- 연결된 선생님만 그 학생에게 제안을 만들 수 있다.
create policy "linked manager creates proposal" on sb_homework_proposals for insert with check (
  auth.uid() = manager_id and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_homework_proposals.student_id and l.manager_id = auth.uid()
  )
);

create policy "student reads own proposals" on sb_homework_proposals for select using (auth.uid() = student_id);
create policy "manager reads own sent proposals" on sb_homework_proposals for select using (auth.uid() = manager_id);

-- 학생 본인만 자기한테 온 제안의 상태(수락/거절)를 바꿀 수 있다.
create policy "student responds to own proposal" on sb_homework_proposals for update using (
  auth.uid() = student_id
) with check (
  auth.uid() = student_id
);
