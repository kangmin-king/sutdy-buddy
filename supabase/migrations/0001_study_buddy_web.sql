create table sb_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  grade text not null check (grade in ('중1', '중2', '중3', '고1', '고2', '고3')),
  main_subjects text[] not null default '{}',
  goal text not null default '',
  exam_date date,
  workbooks text not null default '',
  onboarded_at timestamptz not null default now()
);
alter table sb_profiles enable row level security;
create policy "select own profile" on sb_profiles for select using (auth.uid() = id);
create policy "insert own profile" on sb_profiles for insert with check (auth.uid() = id);
create policy "update own profile" on sb_profiles for update using (auth.uid() = id);

create table sb_daily_conditions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  sleep_hours numeric not null,
  fatigue smallint not null check (fatigue between 1 and 5),
  focus smallint not null check (focus between 1 and 5),
  mood text not null,
  notes text not null default '',
  unique (user_id, date)
);
alter table sb_daily_conditions enable row level security;
create policy "own daily conditions" on sb_daily_conditions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table sb_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type text not null,
  label text not null,
  start_time time not null,
  end_time time not null
);
alter table sb_schedule_blocks enable row level security;
create policy "own schedule blocks" on sb_schedule_blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table sb_planner_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  "order" smallint not null,
  subject_id text not null,
  start_time time not null,
  study_type text,
  material text not null default '',
  unit text not null default '',
  page_range text not null default '',
  end_time time,
  difficulty text,
  rest_pattern text,
  must_do boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'completed', 'partial', 'carried_over')),
  actual_minutes int,
  understanding text,
  partial_reason text,
  incomplete_reason text
);
alter table sb_planner_items enable row level security;
create policy "own planner items" on sb_planner_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table sb_study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  planner_item_id uuid not null references sb_planner_items(id) on delete cascade,
  subject_id text not null,
  rating smallint not null check (rating between 1 and 5),
  blocked_tags text[] not null default '{}',
  detail_note text not null default '',
  self_message text not null default ''
);
alter table sb_study_logs enable row level security;
create policy "own study logs" on sb_study_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table sb_study_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  material_name text not null,
  total_scope int not null check (total_scope > 0),
  current_progress int not null default 0 check (current_progress >= 0),
  target_passes smallint not null default 1 check (target_passes > 0),
  target_date date not null,
  session_interval_days smallint not null default 1 check (session_interval_days > 0),
  created_at timestamptz not null default now()
);
alter table sb_study_materials enable row level security;
create policy "own study materials" on sb_study_materials for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
