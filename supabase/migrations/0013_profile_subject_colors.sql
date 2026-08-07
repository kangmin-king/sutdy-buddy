-- 학생이 오늘 타임라인의 과목별 색을 직접 고를 수 있게, 과목ID -> 색상(hex) 매핑을 프로필에 저장한다.
alter table sb_profiles add column subject_colors jsonb not null default '{}'::jsonb;
