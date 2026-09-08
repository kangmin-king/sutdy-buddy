-- 자동으로 마감된 세션을 매니저가 구분할 수 있게 한다. duration_seconds = 10800을 그냥
-- 저장하면 매니저는 "3시간 공부했다"로 읽지만, 실제로는 40분 하고 나갔을 수도 있고 우리는
-- 모른다. 추정치를 확정치처럼 보이게 두지 않는다.
alter table sb_study_sessions
  add column if not exists auto_closed boolean not null default false;

-- ended_at은 있는데 duration_seconds가 null이거나, 이 브랜치 이전 코드가 상한 없이 써넣은
-- 부풀려진 값을 담고 있는 행을 복구한다. 두 경우 다 매니저 화면을 왜곡한다 — null이면 그
-- 시간이 통째로 사라지고(합계는 duration_seconds ?? 0, 타임라인은 건너뜀), 부풀려진 값이면
-- 정확히 이 작업이 고치려던 그 세션들(예: 720분)이 그대로 남는다.
--
-- 3시간 상한이 실제로 걸리는 행은 duration_seconds가 두 타임스탬프에서 그대로 나온 관측치가
-- 아니라 우리가 지어낸 상한값이다 — auto_closed를 true로 세워 추정치임을 밝힌다. 상한 밑이면
-- 학생이 실제로 멈춘 시각 그대로이므로 false로 둔다.
update sb_study_sessions
set duration_seconds = least(10800, greatest(0, extract(epoch from (ended_at - started_at))::int)),
    auto_closed      = extract(epoch from (ended_at - started_at)) > 10800
where ended_at is not null and (duration_seconds is null or duration_seconds > 10800);
