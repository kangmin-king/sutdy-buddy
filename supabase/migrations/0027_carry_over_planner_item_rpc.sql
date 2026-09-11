-- 숙제 이월을 한 트랜잭션으로 묶는다.
--
-- 클라이언트가 "오늘 항목을 carried_over로 update" + "내일 날짜로 사본 insert" 두 요청을 따로
-- 보내고 있었다. 둘 사이에 원자성이 없어서 한쪽만 성공하면 이렇게 갈라진다:
--
--   update 실패 + insert 성공 → 오늘 항목이 planned로 남고 내일에도 사본이 있다. 숙제 중복.
--   update 성공 + insert 실패 → 오늘은 이월됨으로 닫히고 내일에는 아무것도 없다.
--                                **새로고침하면 숙제가 사라진다.** 학생은 숙제를 잃고,
--                                선생님 화면에는 "이월함"으로 보여서 아무도 알아채지 못한다.
--
-- 게다가 클라이언트는 update 실패 후에도 멈추지 않고 insert를 계속 보냈다 — 위 두 경우가
-- 실제로 도달 가능했다.
--
-- security invoker(plpgsql 기본)라 RLS가 그대로 적용된다. 남의 항목은 update/insert 모두
-- 정책에 막히므로 이 함수가 권한을 넓히지 않는다.
create or replace function carry_over_planner_item(
  source_item_id uuid,
  target_item_id uuid,
  target_date date,
  target_order integer
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  moved integer;
begin
  -- 이미 이월된 항목을 두 번 이월하는 것을 막는다(더블탭·재시도). 조건에 status를 넣어
  -- 경합에서도 한 번만 통과하게 한다.
  update sb_planner_items
  set status = 'carried_over'
  where id = source_item_id and status <> 'carried_over';

  get diagnostics moved = row_count;
  if moved = 0 then
    raise exception '이월할 항목을 찾을 수 없거나 이미 이월했습니다';
  end if;

  -- 원본에서 복사한다. 클라이언트가 보낸 필드를 믿지 않으므로 값이 어긋날 여지가 없다.
  -- 이월된 사본은 "아직 안 한 상태"로 시작해야 하므로 수행 결과 컬럼들은 비운다.
  insert into sb_planner_items (
    id, user_id, date, "order", subject_id, start_time, study_type,
    material, unit, page_range, end_time, difficulty, rest_pattern,
    must_do, status, actual_minutes, understanding, partial_reason,
    incomplete_reason, source, homework_assignment_id, exam_subject_range_id
  )
  select
    target_item_id, user_id, target_date, target_order, subject_id, start_time, study_type,
    material, unit, page_range, end_time, difficulty, rest_pattern,
    must_do, 'planned', null, null, null,
    null, source, homework_assignment_id, exam_subject_range_id
  from sb_planner_items
  where id = source_item_id;
end;
$$;

revoke execute on function carry_over_planner_item(uuid, uuid, date, integer) from public;
grant execute on function carry_over_planner_item(uuid, uuid, date, integer) to authenticated;
