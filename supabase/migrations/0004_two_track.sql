alter table sb_profiles add column role text not null default 'student' check (role in ('student', 'manager'));
alter table sb_profiles add column invite_code text unique;

create table sb_student_manager_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  unique (student_id, manager_id)
);
alter table sb_student_manager_links enable row level security;
create policy "student sees own links" on sb_student_manager_links for select using (auth.uid() = student_id);
create policy "manager sees own links" on sb_student_manager_links for select using (auth.uid() = manager_id);
create policy "manager creates link" on sb_student_manager_links for insert with check (auth.uid() = manager_id);
create policy "either side deletes link" on sb_student_manager_links for delete using (auth.uid() = student_id or auth.uid() = manager_id);

create table sb_homework_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  material text not null default '',
  amount_per_day text not null default '',
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default now()
);
alter table sb_homework_assignments enable row level security;
create policy "student reads own homework" on sb_homework_assignments for select using (auth.uid() = student_id);
create policy "linked manager manages homework" on sb_homework_assignments for all using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_homework_assignments.student_id and l.manager_id = auth.uid())
) with check (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_homework_assignments.student_id and l.manager_id = auth.uid())
);

alter table sb_planner_items add column source text not null default 'self' check (source in ('homework', 'self'));
alter table sb_planner_items add column homework_assignment_id uuid references sb_homework_assignments(id) on delete set null;

create table sb_study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planner_item_id uuid not null references sb_planner_items(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  deviated boolean not null default false
);
alter table sb_study_sessions enable row level security;
create policy "own study sessions" on sb_study_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "linked manager reads sessions" on sb_study_sessions for select using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_study_sessions.user_id and l.manager_id = auth.uid())
);
