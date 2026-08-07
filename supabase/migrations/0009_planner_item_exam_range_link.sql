-- 진도관리 탭에서 등록한 교재/범위(sb_exam_subject_ranges)를 수정할 수 있으려면, 그 범위가
-- 실제로 어떤 sb_planner_items 행들을 만들었는지 역추적할 수 있어야 한다. 지금은 연결이 없어서
-- "이 범위를 수정하면 어떤 항목을 바꿔야 하는지" 알 방법이 없다.
alter table sb_planner_items add column exam_subject_range_id uuid references sb_exam_subject_ranges(id) on delete set null;
create index if not exists sb_planner_items_exam_subject_range_id_idx on sb_planner_items (exam_subject_range_id);
