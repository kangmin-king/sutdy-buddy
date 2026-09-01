# 학습 세션 기록 정직성 설계

**날짜:** 2026-09-01
**한 줄:** 멈춤을 누르지 않은 학습 세션이 매니저의 기록을 거짓으로 만드는 것을 막는다.

## 배경 — 왜 이 스펙이 생겼나

원래 요청은 "화면을 끄거나 앱을 나가도 타이머가 백그라운드에서 진행되면 좋겠다"였다. 코드를 읽어보니 **그건 이미 된다.** 학습 시간은 `started_at` 타임스탬프 기준으로 계산되고(`buildStudentHomeModel`), 세션 시작 즉시 서버에 행이 들어가며(`startStudySession`), 앱이 죽었다 켜져도 열린 세션을 찾아 복구하는 코드가 있다(`deriveRunningSessionIds`). 포그라운드 서비스를 새로 만들 이유가 없다.

대신 그 코드를 읽는 과정에서 두 개의 실제 결함이 나왔다. 둘 다 "학생이 멈춤을 누르지 않았을 때" 벌어지고, 둘 다 매니저가 보는 숫자를 거짓으로 만든다.

## 문제

### 결함 1 — 열린 세션에 상한이 없다

`buildStudentHomeModel`의 실시간 경과는 `now - startedAt`이고 위쪽 한계가 없다. 학생이 아침 9시에 시작하고 밤 9시에 앱을 열면 화면에 `12:00:00 학습`이 뜬다. 3시간 상한(`SESSION_MAX_MILLIS`)은 딴짓 멈춰와 쉬는 시간 경로(`secondsUntil`)에만 걸려 있고 일반 학습 세션에는 걸려 있지 않다.

### 결함 2 — 자정을 넘긴 열린 세션은 아무도 닫지 않는다

복구·정리를 하는 두 함수(`deriveRunningSessionIds`, `findStaleRunningSessions`)는 모두 `visibleItemIds`(오늘 미완료 항목)로 거른다. 어제 열린 채 남은 세션의 플래너 항목은 오늘 목록에 없으므로 **영영 대상이 되지 않는다.** 그 행은 `ended_at` null, `duration_seconds` null로 남는다.

그리고 매니저 화면은 열린 세션을 보지 못한다:

- 합계는 `sess.durationSeconds ?? 0` — 0으로 들어간다 (`ManagerHome.tsx:27`)
- 타임라인은 `endedAt == null || durationSeconds == null`이면 건너뛴다 (`ChecklistTimeline.tsx:42`)

즉 학생이 어제 실제로 두 시간을 공부했어도, 멈춤을 안 눌렀으면 **매니저에게 그 공부는 존재하지 않는다.** 결함 1이 시간을 부풀린다면 결함 2는 시간을 통째로 지운다.

### 결함 3 — `endStudySession`이 duration에 null을 쓸 수 있다

```ts
const existing = (state.studySessions[plannerItemId] ?? []).find((sess) => sess.id === sessionId);
const durationSeconds = existing ? (displayedSeconds ?? …) : null;
```

`existing`을 못 찾으면 `duration_seconds`에 null을 쓴다. 그 행은 `ended_at`은 있고 `duration_seconds`는 없는 상태가 되어 결함 2와 똑같이 매니저 화면에서 사라진다. 같은 실패(시간이 증발한다)의 세 번째 경로라 이 스펙에 포함한다.

## 결정

- **상한은 3시간**(`SESSION_MAX_MILLIS`). 딴짓 멈춰가 이미 쓰는 값과 같게 둔다 — 학생이 겪는 규칙이 하나여야 한다.
- **자동으로 닫힌 세션은 매니저가 구분할 수 있어야 한다.** `duration_seconds = 10800`을 그냥 저장하면 매니저는 "3시간 공부했다"로 읽는다. 실제로는 40분 하고 나갔을 수도 있고 우리는 모른다. 추정치를 확정치처럼 보이게 두지 않는다.
- **놀고 있는 `deviated` 컬럼을 재활용하지 않는다.** 보류 중인 마이그레이션 0021이 그 컬럼을 drop한다.

## 아키텍처

규칙은 하나다: **한 학습 세션은 3시간을 넘게 기여할 수 없다.** 이 규칙을 순수 함수 하나에 담고, 화면 표시와 자동 마감이 **같은 함수**를 쓴다. 둘이 각자 계산하면 언젠가 어긋나고, 어긋나면 학생이 본 숫자와 저장된 숫자가 달라진다.

쓰기는 렌더 틱에서 발사하지 않는다. 1초 주기 `now` 갱신에 쓰기를 걸면 `d91eee3`에서 고친 재진입 버그와 같은 모양이 된다. 대신 명시적인 트리거 세 개만 쓴다.

### 파일 구조

| 파일 | 책임 |
|------|------|
| `src/screens/student/studySessionModel.ts` (신규) | 상한 규칙과 만료 세션 탐색. 순수 함수만. |
| `src/screens/student/pendingPauseModel.ts` (수정) | `secondsUntil` 삭제, 새 모듈의 `cappedSessionSeconds`를 쓴다 |
| `src/screens/student/useExpiredSessionClose.ts` (신규) | 마감 쓰기를 발사하는 훅. 트리거와 중복 방지 담당. |
| `src/App.tsx` (수정) | 훅을 학생 셸에서 부른다 |
| `src/screens/student/studentHomeModel.ts` (수정) | 실시간 경과에 상한, 닫힌 세션을 실행 중 목록에서 걸러냄 |
| `src/state/AppStateContext.tsx` (수정) | `autoCloseStudySession` 액션, 결함 3 수정 |
| `src/state/mappers.ts`, `src/types/index.ts`, `src/types/db.ts` (수정) | `autoClosed` 필드 |
| `src/screens/shared/ChecklistTimeline.tsx`, `src/screens/manager/ManagerHome.tsx` (수정) | 자동 마감 표시 |
| `supabase/migrations/0022_study_session_auto_closed.sql` (신규) | 컬럼 추가 |

## 구성 요소

### `studySessionModel.ts`

```ts
import { SESSION_MAX_MILLIS } from '../distractionStopModel';

export const MAX_SESSION_SECONDS = SESSION_MAX_MILLIS / 1000; // 10800

export function cappedSessionSeconds(startedAt: string, atMillis: number): number;

export interface ExpiredOpenSession {
  itemId: string;
  sessionId: string;
  endedAt: string;          // ISO. startedAt + 3시간.
  durationSeconds: number;  // 항상 MAX_SESSION_SECONDS
}

export function findExpiredOpenSessions(
  studySessions: Readonly<Record<string, readonly StudySession[]>>,
  nowMillis: number,
): ExpiredOpenSession[];
```

`cappedSessionSeconds`는 기존 `secondsUntil`을 그대로 옮긴 것이다(`min(MAX, max(0, …))`). 이름만 바꿔서 "쉬는 시간 전용"으로 읽히지 않게 한다. `pendingPauseModel.ts`와 `usePendingStudyPause.ts`의 호출부를 새 이름으로 바꾸고, 옮겨온 테스트도 함께 옮긴다.

`findExpiredOpenSessions`의 요점은 **`visibleItemIds`로 거르지 않는다**는 것이다. 그게 결함 2의 수정 그 자체다. 클라이언트는 이미 학생의 전체 세션 이력을 날짜 필터 없이 받아오므로(`select('*').eq('user_id', userId)`) 추가 조회가 없다.

- 열린 세션의 정의: `endedAt == null`. (매니저 타임라인이 키로 쓰는 값과 같게 맞춘다.)
- 만료 조건: `Date.parse(startedAt) + SESSION_MAX_MILLIS <= nowMillis`. 정확히 3시간인 순간 만료다.
- `startedAt`이 파싱되지 않는 행은 건너뛴다(만료로 취급하지 않는다). 못 읽는 값에 마감을 쓰는 것보다 남겨두는 편이 안전하다.

### `useExpiredSessionClose.ts`

세 개의 트리거에서 `findExpiredOpenSessions`를 돌리고 결과를 `actions.autoCloseStudySession`으로 보낸다.

1. **마운트** — 앱을 켰을 때 밀려 있던 세션을 정리한다
2. **앱 복귀** — `CapacitorApp.addListener('resume')`. 학생이 돌아오는 바로 그 순간이다
3. **앱을 열어둔 채 3시간을 넘길 때** — 새 타이머를 만들지 않는다. 이미 도는 1초 `now`를 **분 단위로 내려서**(`Math.floor(now / 60000)`) 이 훅의 의존성으로 쓴다. 1분에 한 번 스캔이 돌고, 스캔은 메모리에 있는 세션 몇 개를 훑는 순수 계산이다

이미 보낸 `sessionId`는 ref의 `Set`에 넣어 같은 마운트 안에서 두 번 보내지 않는다. `useAllowedAppUsageFlush`가 쓰는 것과 같은 모양이다.

`isNativePlatform()`이 아닐 때는 resume 리스너를 걸지 않는다(웹에서는 마운트 트리거만).

### 닫힌 세션이 화면을 막지 않게 하기

`StudentHome`의 `runningSessionId`는 화면 상태이고, 셸의 훅이 세션을 닫아도 그대로 남는다. `canStartStudyItem`은 그 **키만** 보므로(`Object.keys(...).length`) 닫힌 세션이 남아 있는 동안 학생은 **다른 항목을 시작할 수 없다.** 지금도 `usePendingStudyPause`가 같은 상황을 만들지만(`handleStop`의 주석이 그 사실을 기록하고 있다) 자동 마감이 들어오면 훨씬 자주 벌어진다.

순수 함수 하나를 더한다:

```ts
export function filterOpenRunningSessions(
  runningSessionIds: Readonly<Record<string, string>>,
  studySessions: Readonly<Record<string, readonly StudySession[]>>,
): Record<string, string>;
```

세션이 이미 닫힌 항목은 결과에서 뺀다. `StudentHome`은 원본 대신 이 값을 `canStartStudyItem`·버튼 표시·`buildStudentHomeModel`에 넘긴다. 이렇게 하면 마감이 어디서 일어났든(쉬는 시간, 자동 마감, 다른 탭) 화면이 스스로 회복한다.

### `autoCloseStudySession` 액션

```ts
autoCloseStudySession: (itemId: string, sessionId: string, endedAt: string, durationSeconds: number) => Promise<void>;
```

`endStudySession`을 재사용하지 않는다 — 그쪽은 `endedAt`을 항상 "지금"으로 잡는데, 자동 마감은 `startedAt + 3시간`이라는 과거 시각을 써야 한다.

```ts
await supabase
  .from('sb_study_sessions')
  .update({ ended_at: endedAt, duration_seconds: durationSeconds, auto_closed: true })
  .eq('id', sessionId)
  .is('ended_at', null);
```

`.is('ended_at', null)`이 핵심이다. 스캔과 쓰기 사이에 학생이 직접 멈춤을 눌렀다면 그 정직한 값을 덮어쓰면 안 된다. 이 조건이 없으면 자동 마감이 실제 기록을 이긴다.

로컬 상태는 기존 쓰기 액션들과 같은 낙관적 갱신 + 실패 시 `WRITE_FAILURE_MESSAGE` 패턴을 따른다.

### 결함 3 수정

`endStudySession`에서 `existing`을 못 찾았을 때 `duration_seconds`에 null을 쓰는 대신, `ended_at`과 함께 계산 가능한 값을 쓴다. `displayedSeconds`가 있으면 그것을, 없으면 그 자리에서는 duration을 **건드리지 않는다**(`ended_at`만 갱신). null로 덮어써서 시간을 지우는 것이 지금의 실패다.

### 마이그레이션 0022

```sql
alter table sb_study_sessions
  add column auto_closed boolean not null default false;

-- 결함 3이 이미 만들어 놓은 행 복구: ended_at은 있는데 duration_seconds가 null인 행은
-- 매니저 화면에서 통째로 사라진다. 이 값은 추측이 아니라 두 타임스탬프에서 그대로 나오므로
-- auto_closed를 세우지 않는다 — 학생이 실제로 멈춘 시각이 맞다. 3시간 상한만 씌운다.
update sb_study_sessions
set duration_seconds = least(10800, greatest(0, extract(epoch from (ended_at - started_at))::int))
where ended_at is not null and duration_seconds is null;
```

`auto_closed`의 기존 행은 전부 `false` — 지금까지 저장된 값은 모두 학생이 직접 멈춘 것이거나 쉬는 시간이 닫은 것이므로 맞다.

이 백필이 없으면 결함 3의 코드 수정은 **앞으로 생길 행만** 막고, 이미 사라진 시간은 영영 사라진 채로 남는다.

**순서:** 0020(허용앱 구간)을 먼저 적용하고 그다음 0022다. 0021은 번호 순서 밖에 있고 모든 학생이 이 브랜치 APK를 깔기 전까지 보류다.

### 매니저 표시

- `TimelineColumn`: 자동 마감 칸은 채도를 낮춰(`opacity` 0.8 → 0.35) 그린다. **빗금은 쓸 수 없다** — 45° 빗금은 이미 허용앱 칸이 쓰고 있어서(`TimelineColumn.tsx`) 겹치면 둘을 구분할 수 없다. 칸의 `title`에 `자동 마감`을 넣는다 — 색만으로 정보를 전달하지 않는다. `TimelineSegment`에 `autoClosed: boolean`을 추가한다.
- `ManagerHome`: 세션 시간을 문자로 보여주는 자리에 `(자동 마감)`을 붙인다.

합계에는 **포함한다.** 3시간은 상한이지 0이 아니고, 빼버리면 결함 2(시간이 사라진다)를 다시 만드는 셈이다.

## 데이터 흐름

```
학생이 멈춤을 안 누름
        │
        ├── 앱을 열어둠 ──────────► 1초 틱이 화면 경과를 3:00:00에서 멈춤
        │                              │ 3시간에 닿음
        │                              ▼
        │                        useExpiredSessionClose (트리거 3)
        │
        └── 앱을 나감/죽음 ──► 다시 열거나 복귀
                                       │
                                       ▼
                              useExpiredSessionClose (트리거 1·2)
                                       │
                              findExpiredOpenSessions
                              (항목 가시성으로 거르지 않음 ← 자정 문제 수정)
                                       │
                                       ▼
                              autoCloseStudySession
                              ended_at = startedAt+3h
                              duration_seconds = 10800
                              auto_closed = true
                              WHERE ended_at IS NULL  ← 학생의 직접 멈춤을 이기지 않음
                                       │
                                       ▼
                              매니저 화면에 (자동 마감)으로 표시
```

## 오류 처리

- 쓰기 실패: 기존 패턴대로 `console.error` + `WRITE_FAILURE_MESSAGE` 배너. 다음 트리거에서 다시 시도된다(ref Set은 마운트 단위라 재마운트하면 리셋).
- 파싱 불가한 `startedAt`: 만료로 취급하지 않고 남겨둔다.
- 기기 시계가 뒤로 튄 경우: `cappedSessionSeconds`의 `max(0, …)`가 음수를 막는다.
- 동시성: `.is('ended_at', null)` 조건이 학생의 직접 멈춤과 경합해도 정직한 값이 이기게 한다.

## 테스트

Robolectric도 계측 테스트도 없는 프로젝트이므로 **순수 함수에 테스트를 몬다.** 훅과 액션은 순수 부분을 최대한 밖으로 빼서 얇게 만든다.

`studySessionModel.test.ts`:
- `cappedSessionSeconds`: 3시간 미만/정확히 3시간/초과, 음수(시계 역행), 0
- `findExpiredOpenSessions`:
  - **오늘 항목에 없는 어제 세션을 찾아낸다** (결함 2의 회귀 테스트 — 이게 없으면 이 스펙의 핵심이 지켜지는지 알 수 없다)
  - 이미 닫힌 세션(`endedAt != null`)은 반환하지 않는다
  - 정확히 3시간 경계를 양쪽에서 고정한다(`3h - 1ms` 미만은 아님, `3h`는 만료)
  - 여러 개가 만료됐으면 전부 반환한다
  - `startedAt`이 파싱 불가면 건너뛴다
  - 반환된 `endedAt`이 `startedAt + 3시간`이고 `durationSeconds`가 10800이다

`pendingPauseModel.test.ts`: `secondsUntil` → `cappedSessionSeconds` 이름 변경에 맞춰 옮긴다. 기존 경계 테스트는 그대로 살린다.

기존 학습 세션 테스트가 이 변경으로 **줄지 않아야 한다.**

## 범위 밖

- 포그라운드 서비스 — 이미 타이머가 정확하므로 필요 없다
- 상단바에 공부 타이머 표시(A안) — 별도 스펙으로 이어서 한다
- 학생에게 "어제 세션이 열려 있었어요, 얼마나 했나요?" 묻기 — 더 정확하지만 범위가 커지고, 귀찮으면 아무 값이나 누를 위험이 있다
- 세션 이력 전체를 날짜 필터 없이 받아오는 것(페이로드가 계속 커진다) — 실재하는 문제지만 이 스펙의 문제가 아니다
