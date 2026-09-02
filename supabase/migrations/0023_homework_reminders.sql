-- 숙제 미시작 알림 (PRD §8.1-1). 정해진 시각까지 오늘 숙제를 시작조차 하지 않으면 연결된
-- 매니저에게 푸시를 보낸다 — 완료했을 때만 알림이 가던 방향을 뒤집는 것이고, 손실회피 철학
-- ("안 하면 티가 난다")에 가장 직접적으로 대응하는 기능이다.
--
-- 번호가 0021이 아닌 이유: 0021·0022는 supabase/deferred-migrations/가 잡고 있는 번호다
-- (구버전 APK가 사라진 뒤에 적용할 것들이라 순서만 예약해 둔 상태).

-- 학생별 알림 시각. **행이 없으면 기본값(21:00, 켜짐)으로 동작한다** — 매니저가 아무것도
-- 설정하지 않아도 기능이 돌아야 하고, 학생마다 행을 미리 만들어두면 연결/해제 때마다 그 행을
-- 관리해야 하기 때문이다. 기본값은 클라이언트(constants.ts)와 알림 함수 양쪽에 같은 값으로
-- 박혀 있다 — 바꿀 때 세 군데를 함께 고칠 것.
--
-- 시각은 Asia/Seoul 기준으로 해석한다(앱의 날짜·시간 계산이 전부 로컬 기준이다).
create table sb_homework_reminder_settings (
  student_id uuid primary key references auth.users(id) on delete cascade,
  remind_at time not null default '21:00',
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table sb_homework_reminder_settings enable row level security;

-- "연결된 매니저" 패턴. SELECT/INSERT/UPDATE/DELETE 네 가지를 for all + with check로 한 번에
-- 덮는다 — 0008(별칭 UPDATE 누락)·0010(매니저 DELETE 누락)에서 정책이 빠지면 오류 없이
-- "0 rows affected"로 조용히 실패한 전례가 있다.
create policy "linked manager manages reminder settings" on sb_homework_reminder_settings for all using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_homework_reminder_settings.student_id and l.manager_id = auth.uid())
) with check (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_homework_reminder_settings.student_id and l.manager_id = auth.uid())
);

-- 학생이 자기 설정을 읽는 건 막지 않는다(0011·0012에서 학생이 자기 시험·과외 일정을 못 읽던
-- 것을 고친 것과 같은 이유). 쓰기는 매니저만 — 학생이 자기를 감시하는 알림을 끌 수 있으면
-- 기능의 의미가 사라진다.
create policy "student reads own reminder setting" on sb_homework_reminder_settings for select using (
  auth.uid() = student_id
);

-- 하루 한 번만 보내기 위한 발송 기록. (student_id, date)가 자연 키라서, 알림 함수는
-- upsert + ignoreDuplicates로 "오늘 내가 처음 보내는가"를 원자적으로 판정한다
-- (sb_allowed_app_intervals와 같은 멱등 패턴). cron이 15분마다 돌아도, 두 번 겹쳐 돌아도
-- 알림은 하루 한 번이다.
create table sb_homework_reminder_log (
  student_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  sent_at timestamptz not null default now(),
  primary key (student_id, date)
);
alter table sb_homework_reminder_log enable row level security;

-- 정책을 **일부러** 만들지 않는다 — 이 표는 알림 함수(service role, RLS 우회)만 읽고 쓴다.
-- 앱에서 접근할 일이 없으므로 "정책 없는 쓰기가 조용히 실패"하는 함정도 여기서는 해당 없다.
-- 앱에서 이 표를 읽어야 할 일이 생기면 그때 SELECT 정책을 추가할 것.
