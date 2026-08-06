-- 전체 브랜치 리뷰에서 발견된 RLS 누락/과대 허용 수정.

-- 1) 0007에서 sb_student_manager_links.label을 추가했지만 UPDATE 정책이 없다(0004는 SELECT/INSERT/DELETE만).
--    RLS상 수정 가능한 행이 0개인 UPDATE는 에러가 아니라 "0 rows affected" 성공이라,
--    학생 별칭 변경이 아무 오류 없이 조용히 사라진다(낙관적 UI 때문에 성공한 것처럼 보임).
create policy "manager updates own link label" on sb_student_manager_links for update using (
  auth.uid() = manager_id
) with check (
  auth.uid() = manager_id
);

-- 2) 과외 일정/예외 테이블은 manager_id = auth.uid()만 검사해서, 실제로 연결되지 않은 학생 id로도
--    행을 만들 수 있었다. 다른 신규 테이블과 동일하게 "연결된 관리자" 패턴으로 맞춘다.
--    (정책 이름이 0007과 같으므로 create 전에 drop 해야 한다.)
drop policy "linked manager manages own tutoring schedule" on sb_tutoring_schedules;
create policy "linked manager manages own tutoring schedule" on sb_tutoring_schedules for all using (
  manager_id = auth.uid() and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_tutoring_schedules.student_id and l.manager_id = auth.uid()
  )
) with check (
  manager_id = auth.uid() and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_tutoring_schedules.student_id and l.manager_id = auth.uid()
  )
);

drop policy "linked manager manages own tutoring exceptions" on sb_tutoring_schedule_exceptions;
create policy "linked manager manages own tutoring exceptions" on sb_tutoring_schedule_exceptions for all using (
  manager_id = auth.uid() and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_tutoring_schedule_exceptions.student_id and l.manager_id = auth.uid()
  )
) with check (
  manager_id = auth.uid() and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_tutoring_schedule_exceptions.student_id and l.manager_id = auth.uid()
  )
);
