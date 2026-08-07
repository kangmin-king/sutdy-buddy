-- 관리자가 자기 화면에서만 보는 학생 별칭 (연필 아이콘으로 수정, 학생 본인/다른 관리자에게는 영향 없음)
alter table sb_student_manager_links add column label text;

-- 시험/평가 항목 (메인 1개 + 수행평가·모의고사 등 추가 가능)
create table sb_exam_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  exam_date date not null,
  is_main boolean not null default false,
  created_at timestamptz not null default now()
);
alter table sb_exam_records enable row level security;
create policy "linked manager manages exam records" on sb_exam_records for all using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_exam_records.student_id and l.manager_id = auth.uid())
) with check (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_exam_records.student_id and l.manager_id = auth.uid())
);

-- 시험 안의 과목별 목표
create table sb_exam_subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references sb_exam_records(id) on delete cascade,
  subject_id text not null,
  target_grade text not null default '',
  target_score text not null default '',
  target_rank text not null default '',
  created_at timestamptz not null default now()
);
alter table sb_exam_subjects enable row level security;
create policy "linked manager manages exam subjects" on sb_exam_subjects for all using (
  exists (
    select 1 from sb_exam_records e
    join sb_student_manager_links l on l.student_id = e.student_id
    where e.id = sb_exam_subjects.exam_id and l.manager_id = auth.uid()
  )
) with check (
  exists (
    select 1 from sb_exam_records e
    join sb_student_manager_links l on l.student_id = e.student_id
    where e.id = sb_exam_subjects.exam_id and l.manager_id = auth.uid()
  )
);

-- 과목에 등록한 교재/범위 이력 (진도관리 탭에 카드로 표시)
create table sb_exam_subject_ranges (
  id uuid primary key default gen_random_uuid(),
  exam_subject_id uuid not null references sb_exam_subjects(id) on delete cascade,
  material text not null,
  range_label text not null,
  assigned_dates date[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table sb_exam_subject_ranges enable row level security;
create policy "linked manager manages exam subject ranges" on sb_exam_subject_ranges for all using (
  exists (
    select 1 from sb_exam_subjects es
    join sb_exam_records e on e.id = es.exam_id
    join sb_student_manager_links l on l.student_id = e.student_id
    where es.id = sb_exam_subject_ranges.exam_subject_id and l.manager_id = auth.uid()
  )
) with check (
  exists (
    select 1 from sb_exam_subjects es
    join sb_exam_records e on e.id = es.exam_id
    join sb_student_manager_links l on l.student_id = e.student_id
    where es.id = sb_exam_subject_ranges.exam_subject_id and l.manager_id = auth.uid()
  )
);

-- 학생별 과외 요일 패턴 (관리자당 1개, 거의 안 바뀜)
create table sb_tutoring_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  weekdays smallint[] not null default '{}', -- 0=일 .. 6=토
  updated_at timestamptz not null default now(),
  unique (student_id, manager_id)
);
alter table sb_tutoring_schedules enable row level security;
create policy "linked manager manages own tutoring schedule" on sb_tutoring_schedules for all using (
  manager_id = auth.uid()
) with check (
  manager_id = auth.uid()
);

-- 특정 날짜 예외 (취소/변경)
create table sb_tutoring_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  original_date date not null,
  new_date date, -- null = 그 날은 취소
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table sb_tutoring_schedule_exceptions enable row level security;
create policy "linked manager manages own tutoring exceptions" on sb_tutoring_schedule_exceptions for all using (
  manager_id = auth.uid()
) with check (
  manager_id = auth.uid()
);

-- 링크된 관리자가 학생 대신 숙제 항목(source='homework')을 만들고, 읽고, 수정할 수 있어야 한다.
-- 현재 sb_planner_items는 "auth.uid() = user_id"만 허용되어 있어 관리자가 학생 이름으로 쓸 수 없다.
create policy "linked manager creates homework items" on sb_planner_items for insert with check (
  source = 'homework' and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_planner_items.user_id and l.manager_id = auth.uid()
  )
);
create policy "linked manager reads planner items" on sb_planner_items for select using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_planner_items.user_id and l.manager_id = auth.uid())
);
create policy "linked manager updates homework items" on sb_planner_items for update using (
  source = 'homework' and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_planner_items.user_id and l.manager_id = auth.uid()
  )
);

-- RLS 서브쿼리가 행마다 조회하는 컬럼에 인덱스
create index if not exists sb_exam_records_student_id_idx on sb_exam_records (student_id);
create index if not exists sb_exam_subjects_exam_id_idx on sb_exam_subjects (exam_id);
create index if not exists sb_exam_subject_ranges_exam_subject_id_idx on sb_exam_subject_ranges (exam_subject_id);
create index if not exists sb_tutoring_schedules_student_id_idx on sb_tutoring_schedules (student_id);
create index if not exists sb_tutoring_schedule_exceptions_student_id_idx on sb_tutoring_schedule_exceptions (student_id);
