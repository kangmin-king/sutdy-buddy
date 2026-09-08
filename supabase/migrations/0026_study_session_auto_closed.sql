-- 자동으로 마감된 세션을 매니저가 구분할 수 있게 한다. duration_seconds = 10800을 그냥
-- 저장하면 매니저는 "3시간 공부했다"로 읽지만, 실제로는 40분 하고 나갔을 수도 있고 우리는
-- 모른다. 추정치를 확정치처럼 보이게 두지 않는다.
alter table sb_study_sessions
  add column if not exists auto_closed boolean not null default false;

-- ended_at은 있는데 duration_seconds가 null인 행 복구. 그런 행은 매니저 화면에서 통째로
-- 사라진다 — 합계는 (duration_seconds ?? 0)이고 타임라인은 duration_seconds가 없으면
-- 건너뛴다. 이 값은 추측이 아니라 두 타임스탬프에서 그대로 나오므로 auto_closed를 세우지
-- 않는다: 학생이 실제로 멈춘 시각이 맞다. 3시간 상한만 씌운다.
update sb_study_sessions
set duration_seconds = least(10800, greatest(0, extract(epoch from (ended_at - started_at))::int))
where ended_at is not null and duration_seconds is null;
