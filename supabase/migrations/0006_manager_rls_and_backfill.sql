-- 관리자(선생님/학부모) 트랙이 실제로 동작하려면 두 가지 읽기 경로가 열려야 한다.
--   1) 연결 전: 초대코드로 학생을 찾아야 한다. 하지만 아직 링크가 없으므로 어떤 RLS 정책으로도
--      상대 프로필 행을 볼 수 없다. `for select using (invite_code is not null)` 같은 넓은 정책은
--      모든 프로필 행을 열거(enumeration) 가능하게 만들기 때문에 쓰지 않고,
--      코드를 정확히 아는 경우에만 id 하나를 돌려주는 security definer 함수로 좁게 뚫는다.
--   2) 연결 후: 링크된 관리자는 담당 학생의 프로필 행을 읽을 수 있어야 한다(loadAll의 managedStudents).

-- 1) 초대코드 → 학생 id 조회 (RLS 우회, 정확 일치만)
create or replace function find_student_by_invite_code(code text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from sb_profiles p
  where p.invite_code = upper(code)
    and p.role = 'student'
  limit 1;
$$;

revoke execute on function find_student_by_invite_code(text) from public;
grant execute on function find_student_by_invite_code(text) to authenticated;

-- 2) 링크된 관리자는 담당 학생 프로필을 읽을 수 있다
create policy "linked manager reads student profile" on sb_profiles for select using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_profiles.id and l.manager_id = auth.uid())
);

-- 3) 0004 이전에 가입한 학생들은 invite_code가 NULL이라 영구히 연결 불가 상태다.
--    클라이언트가 만드는 코드(crypto.randomUUID().slice(0,8).toUpperCase())와 같은 모양인
--    8자리 대문자 16진 문자열로 백필한다. invite_code에는 0004에서 이미 unique 제약이 있으므로
--    충돌 가능성(8자리 hex = 약 43억분의 1)에 대비해 충돌 시 재시도한다.
do $$
declare
  target uuid;
  candidate text;
begin
  for target in select id from sb_profiles where invite_code is null and role = 'student' loop
    loop
      candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      exit when not exists (select 1 from sb_profiles where invite_code = candidate);
    end loop;
    update sb_profiles set invite_code = candidate where id = target;
  end loop;
end $$;

-- 4) RLS 정책들이 행마다 서브쿼리로 조회하는 컬럼에 인덱스를 건다.
--    (sb_student_manager_links의 unique (student_id, manager_id)는 student_id 선행 인덱스만
--     제공하므로 manager_id 단독 조회에는 별도 인덱스가 필요하다.)
create index if not exists sb_student_manager_links_manager_id_idx on sb_student_manager_links (manager_id);
create index if not exists sb_student_manager_links_student_id_idx on sb_student_manager_links (student_id);
create index if not exists sb_study_sessions_user_id_idx on sb_study_sessions (user_id);
