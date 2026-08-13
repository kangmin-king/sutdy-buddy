-- 별도 어드민 사이트(관리자/운영자)와 학생 앱에 노출할 배너. sb_profiles(학생 온보딩 전용 컬럼이
-- 전부 not null)를 재사용하지 않고 완전히 별개 테이블로 둔다 — 관리자는 학년/과목 같은 학생
-- 전용 필드가 필요 없다.
create table sb_admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'operator')),
  created_at timestamptz not null default now()
);
alter table sb_admin_users enable row level security;
create policy "admin users read own row" on sb_admin_users for select using (auth.uid() = id);
create policy "admins manage admin users" on sb_admin_users for all using (
  exists (select 1 from sb_admin_users a where a.id = auth.uid() and a.role = 'admin')
) with check (
  exists (select 1 from sb_admin_users a where a.id = auth.uid() and a.role = 'admin')
);

create table sb_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  link_url text,
  start_date date not null,
  end_date date,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sb_banners enable row level security;
-- 배너 내용은 민감 정보가 아니고 학생 앱이 로그인 세션 안에서 바로 읽어야 하므로 SELECT는 공개.
create policy "anyone reads banners" on sb_banners for select using (true);
create policy "admin_users manage banners" on sb_banners for all using (
  exists (select 1 from sb_admin_users a where a.id = auth.uid())
) with check (
  exists (select 1 from sb_admin_users a where a.id = auth.uid())
);
