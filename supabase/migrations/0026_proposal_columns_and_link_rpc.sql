-- 코덱스 코드 리뷰에서 [높음]으로 올라온 RLS 구멍 두 건. 둘 다 실제 정책 파일과 클라이언트
-- 호출부를 대조해 확인했다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 학생이 자기한테 온 숙제 제안의 **내용까지** 바꿀 수 있었다
--
-- 0018의 정책 주석은 "상태(수락/거절)를 바꿀 수 있다"였지만, 정책은 컬럼을 구분하지 않는다.
-- RLS는 "어떤 행을" 만 표현할 수 있고 "어떤 컬럼을"은 표현하지 못한다. 그래서 학생이
-- PostgREST update로 date·subject_id·material·page_range·manager_id까지 바꿀 수 있었다.
--
-- 실제 악용: 선생님이 "9/10 수학 10쪽"을 제안하면 학생이 "9/10 수학 1쪽"으로 고친 뒤 수락한다.
-- 선생님도 같은 행을 읽으므로(manager reads own sent proposals) 보낸 제안 목록에 고쳐진 값이
-- 보인다 — 선생님은 자기가 1쪽을 냈다고 믿게 된다. 숙제 이행을 기록으로 증명하는 제품에서
-- 기록 자체가 조용히 위조되는 경로다.
--
-- 컬럼 권한으로 막는다. 클라이언트의 respondToHomeworkProposal은 이미 {status, responded_at}만
-- 보내므로(AppStateContext) **앱 변경이 필요 없다.** 매니저는 insert/select만 하고 update는
-- 하지 않으므로 매니저 쪽도 영향이 없다.
revoke update on sb_homework_proposals from authenticated;
grant update (status, responded_at) on sb_homework_proposals to authenticated;

-- 컬럼 권한과 별개로, 행 조건도 의도에 맞게 좁힌다.
--   using       : 아직 답하지 않은(pending) 자기 제안만 건드릴 수 있다 — 이미 수락한 제안을
--                 되돌리거나 거절로 바꾸는 것을 막는다.
--   with check  : 바뀐 뒤 상태는 accepted/rejected여야 하고 응답 시각이 남아야 한다 —
--                 pending으로 되돌려 무한히 다시 답하는 것을 막는다.
drop policy "student responds to own proposal" on sb_homework_proposals;
create policy "student responds to own proposal" on sb_homework_proposals for update using (
  auth.uid() = student_id and status = 'pending'
) with check (
  auth.uid() = student_id and status in ('accepted', 'rejected') and responded_at is not null
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 학생-매니저 링크를 초대코드 없이 UUID만 알면 만들 수 있었다
--
-- 0004의 "manager creates link"는 `auth.uid() = manager_id`만 본다. 즉 초대코드를 아는지와
-- 무관하게, 어떤 학생 UUID를 아는 사람이면 자기를 그 학생의 매니저로 등록할 수 있다.
-- 그러면 "linked manager reads student profile"을 비롯한 연결 기반 정책들이 전부 열려서
-- 그 학생의 학습 데이터를 읽게 된다. 초대코드는 바로 이걸 막으려고 있는 장치인데
-- 정작 링크를 만드는 경로가 코드를 요구하지 않았다.
--
-- ⚠ 2단계로 나눠 고친다. 지금 insert 정책을 없애면 **이미 설치된 v1.2.6이 학생 연결을
--   못 하게 된다** — 그 버전은 RPC로 학생을 찾은 뒤 링크를 직접 insert한다.
--
--   [이번 단계] 코드를 요구하는 RPC를 추가하고, insert 정책은 남기되 역할 조건을 붙여 좁힌다.
--   [다음 단계] 모두가 새 APK를 설치한 뒤 아래 주석의 drop을 실행한다.

create or replace function link_student_by_invite_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
begin
  -- 호출자가 매니저인지 먼저 본다. security definer라 RLS를 우회하므로 여기서 직접 확인해야 한다.
  if not exists (select 1 from sb_profiles p where p.id = auth.uid() and p.role = 'manager') then
    raise exception '관리자 계정만 학생을 연결할 수 있습니다';
  end if;

  -- 정확히 일치하는 코드일 때만 학생 하나를 찾는다(0006의 find_student_by_invite_code와 같은 규칙).
  select p.id into target_student_id
  from sb_profiles p
  where p.invite_code = upper(trim(code)) and p.role = 'student'
  limit 1;

  if target_student_id is null then
    raise exception '초대코드를 찾을 수 없습니다';
  end if;

  -- 같은 쌍을 두 번 눌러도 오류가 나지 않게 한다(0004의 unique (student_id, manager_id)).
  insert into sb_student_manager_links (student_id, manager_id)
  values (target_student_id, auth.uid())
  on conflict (student_id, manager_id) do nothing;

  return target_student_id;
end;
$$;

revoke execute on function link_student_by_invite_code(text) from public;
grant execute on function link_student_by_invite_code(text) to authenticated;

-- 남겨두는 insert 정책에 역할 조건을 붙인다. 구버전 앱의 직접 insert는 계속 되지만,
-- 학생 계정이 자기를 다른 학생의 매니저로 등록하는 경로는 막힌다.
drop policy "manager creates link" on sb_student_manager_links;
create policy "manager creates link" on sb_student_manager_links for insert with check (
  auth.uid() = sb_student_manager_links.manager_id
  and exists (select 1 from sb_profiles p where p.id = sb_student_manager_links.manager_id and p.role = 'manager')
  and exists (select 1 from sb_profiles p where p.id = sb_student_manager_links.student_id and p.role = 'student')
);

-- [다음 단계] 학생·매니저 전원이 link_student_by_invite_code를 쓰는 APK로 올라간 뒤 실행할 것.
-- 그래야 초대코드 없이 링크를 만드는 경로가 완전히 사라진다.
--
--   drop policy "manager creates link" on sb_student_manager_links;
