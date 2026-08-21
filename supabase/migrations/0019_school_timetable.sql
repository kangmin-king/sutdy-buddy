create table sb_school_timetable_slots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 1 and 5), -- 1=월 ... 5=금 (JS Date.getDay() 기준)
  period int not null check (period between 1 and 8),
  subject text not null,
  updated_at timestamptz not null default now(),
  unique (student_id, weekday, period)
);
alter table sb_school_timetable_slots enable row level security;

create policy "student manages own school timetable" on sb_school_timetable_slots for all using (
  auth.uid() = student_id
) with check (
  auth.uid() = student_id
);

create policy "linked manager reads school timetable" on sb_school_timetable_slots for select using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_school_timetable_slots.student_id and l.manager_id = auth.uid())
);

create index if not exists sb_school_timetable_slots_student_id_idx on sb_school_timetable_slots (student_id);
