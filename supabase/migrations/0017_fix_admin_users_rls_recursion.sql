-- sb_admin_users의 "admins manage admin users" 정책이 자기 테이블을 서브쿼리로 다시 조회하면서
-- RLS가 무한 재귀에 빠진다(42P17). security definer 함수로 감싸서 우회한다 — 이 함수는 테이블
-- 소유자(postgres) 권한으로 실행되어 RLS를 다시 트리거하지 않는다. Supabase에서 자기 참조
-- RLS를 다룰 때 쓰는 표준 패턴이다.
create or replace function is_admin_user() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (select 1 from sb_admin_users where id = auth.uid() and role = 'admin');
$$;

drop policy "admins manage admin users" on sb_admin_users;
create policy "admins manage admin users" on sb_admin_users for all using (
  is_admin_user()
) with check (
  is_admin_user()
);
