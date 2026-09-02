# Context — 숙제 미시작 알림

**Last Updated**: 2026-09-02

PRD §5.12의 "숙제 미시작 알림". §8.1 백로그 1순위였던 항목이다.

> 이 폴더에는 `-plan.md`·`-tasks.md`가 없다 — 한 번에 끝낸 작업이라 계획·체크리스트가 남을
> 이유가 없었다. 남길 가치가 있는 건 의사결정과 배포 전제뿐이다.

## 핵심 파일

| 파일 | 역할 |
|---|---|
| `supabase/functions/homework-not-started-reminder/index.ts` | 조회 → 판정 → 발송 기록 → FCM |
| `supabase/functions/homework-not-started-reminder/reminderTargets.ts` | **판정 로직(순수 함수)** |
| `supabase/functions/homework-not-started-reminder/reminderTargets.test.ts` | 그 판정의 테스트(vitest) |
| `supabase/functions/_shared/authClient.ts` | `authenticateServiceRole` — cron 호출용 인증 |
| `supabase/migrations/0023_homework_reminders.sql` | 설정 표 + 발송 기록 표 + RLS |
| `supabase/migrations/0024_homework_reminder_cron.sql` | pg_cron 15분 스케줄 (Vault 전제) |
| `src/screens/manager/ManagerCalendar.tsx` | 매니저 설정 UI (아이콘 줄 → `미시작 알림`) |
| `src/state/AppStateContext.tsx` | `homeworkReminderSettings` 상태 + `upsertHomeworkReminderSetting` |
| `src/constants.ts` | `DEFAULT_HOMEWORK_REMIND_AT` |

## 배포 전제 (이것 없이는 cron이 매번 실패한다)

```bash
supabase functions deploy homework-not-started-reminder
supabase db push        # 0023, 0024
```

Vault에 두 값을 넣어야 한다(대시보드 SQL Editor, 한 번만):

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<service_role_key>', 'service_role_key');
```

## 확인 명령

```bash
# 손으로 한 번 돌려보기 (cron과 같은 경로. 시각·대상 판정 결과가 JSON으로 나온다)
curl -s -X POST "$URL/functions/v1/homework-not-started-reminder" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{}'
```

```sql
-- cron 실행 이력
select * from cron.job_run_details order by start_time desc limit 20;
-- 오늘 누구에게 보냈나
select * from sb_homework_reminder_log where date = current_date;
```

되돌리려면 `select cron.unschedule('homework-not-started-reminder');`.

## 의사결정 로그

- **서버 타이머(pg_cron)를 도입했다** — 이 저장소의 첫 서버 타이머다. 밀린 숙제 재분배는
  "누가 화면을 열 때 계산"으로 서버 없이 해결했지만(2026-08-07 design 문서), *시작하지 않았다*는
  그 방식으로 알 수 없다. 학생이 앱을 열지 않아야 성립하는 조건이라 트리거를 당겨줄 사람이 없다.
- **15분 간격** — 알림 시각을 21:30처럼 30분 단위로 잡을 수 있어야 하고, "정해진 시각 직후"에
  도착하려면 그보다 촘촘해야 한다. 하루 한 번 제한이 있으니 자주 돌아도 중복은 없다.
- **발송 기록을 보내기 전에 남긴다** — `(student_id, date)` 유니크 + `ignoreDuplicates`로
  "오늘 첫 발송인가"를 원자적으로 판정한다. 대가로 FCM이 일시적으로 실패하면 오늘은 재시도하지
  않는다. 같은 잔소리를 두 번 보내는 쪽이 한 번 놓치는 쪽보다 나쁘다고 봤다.
- **하나라도 시작했으면 안 보낸다** — 이 알림이 노리는 건 몰아서 하기가 아니라 손도 안 대기다.
  "몰아서 하기"는 이미 진도관리의 날짜별 분배와 "어제 못한 숙제" 배너가 담당한다.
- **오늘 숙제가 없는 날은 안 보낸다** — 아무것도 배정하지 않은 날까지 알림이 오면 매니저가
  알림 자체를 무시하게 된다.
- **`start_time`을 기준으로 쓰지 않았다** — 숙제 항목의 `start_time`은 생성 경로 전부에서
  `'09:00'`으로 하드코딩돼 있어(진도관리 등록·제안 수락·레거시 지연생성) 아무 의미가 없다.
  학생이 직접 넣은 자기계획만 실제 시각을 갖는다. 그래서 알림 시각은 별도 설정으로 뺐다.
- **학생은 설정을 읽을 수만 있다** — 감시받는 쪽이 알림을 끌 수 있으면 기능이 성립하지 않는다.
  RLS에서 학생에게 SELECT만 줬다.
- **학생에게는 알림을 보내지 않는다** — 미리 알려주면 "안 하면 불편함"이 사라진다. PRD §8.1이
  경계하라고 적어둔 방향이라 의도적으로 뺐다.
- **판정을 순수 함수로 분리했다** — 이 기능의 전부가 그 판정이라 DB·FCM 없이 테스트해야 했다.
  단, `supabase/`는 앱 `tsconfig.json`의 `include: ["src"]` 밖이라 `npx tsc -b`가 타입체크하지
  않는다(나머지 Edge Function과 같은 처지). vitest는 기본 include로 이 테스트를 집어간다.

## 알려진 제약 / 다음에 손댈 것

- **기본값이 세 군데에 박혀 있다** — 0023의 컬럼 기본값, `src/constants.ts`,
  Edge Function의 `DEFAULT_REMIND_AT`. 바꿀 때 함께 고칠 것.
- 매니저 앱 안에는 이 알림의 흔적이 남지 않는다(푸시만 간다). "며칠 미시작"처럼 화면에
  누적해 보여주려면 `sb_homework_reminder_log`를 읽는 SELECT 정책부터 추가해야 한다.
- 시간대가 `Asia/Seoul` 하드코딩이다. 해외 사용자가 생기면 학생별 시간대가 필요하다.
- iOS에는 푸시 자체가 없다(PWA). 안드로이드 전용이다.
