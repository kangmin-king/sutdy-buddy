-- 학생용 새 "캘린더" 탭(선생님 캘린더와 동일한 월간 그리드)이 과외 요일 표시를 하려면
-- 학생 본인 계정으로 자기 과외 스케줄/예외를 읽을 수 있어야 한다.
create policy "student reads own tutoring schedule" on sb_tutoring_schedules for select using (
  student_id = auth.uid()
);

create policy "student reads own tutoring exceptions" on sb_tutoring_schedule_exceptions for select using (
  student_id = auth.uid()
);
