-- 학생이 자기 화면에서만 보는 관리자(선생님/학부모) 별칭. label(관리자→학생 방향, 0007)과
-- 별개 컬럼 — 같은 행을 양쪽이 각자 다른 이름으로 부를 수 있어야 한다.
alter table sb_student_manager_links add column student_label text;

-- 0008의 "manager updates own link label" 정책과 대칭.
create policy "student updates own link student_label" on sb_student_manager_links for update using (
  auth.uid() = student_id
) with check (
  auth.uid() = student_id
);
