-- 학생 본인이 선생님/학부모가 등록한 시험 일정·과목별 목표·교재 범위를 읽을 수 있어야 한다.
-- 기존 정책은 "linked manager manages ..."(for all)만 있어서 학생 계정으로는 조회조차 안 됐다.
create policy "student reads own exam records" on sb_exam_records for select using (
  student_id = auth.uid()
);

create policy "student reads own exam subjects" on sb_exam_subjects for select using (
  exists (select 1 from sb_exam_records e where e.id = sb_exam_subjects.exam_id and e.student_id = auth.uid())
);

create policy "student reads own exam subject ranges" on sb_exam_subject_ranges for select using (
  exists (
    select 1 from sb_exam_subjects es
    join sb_exam_records e on e.id = es.exam_id
    where es.id = sb_exam_subject_ranges.exam_subject_id and e.student_id = auth.uid()
  )
);
