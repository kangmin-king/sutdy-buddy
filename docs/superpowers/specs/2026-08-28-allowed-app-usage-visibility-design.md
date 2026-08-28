# 허용앱 사용을 매니저에게 드러내기

**스펙 C.** [허용 목록 전환 스펙](2026-08-27-distraction-stop-allowlist-design.md)이 범위 밖으로 미뤄둔 마지막 조각이다. 그 스펙이 배포되어 있어야 이 스펙이 의미를 갖는다 — 고를 수 있는 허용앱이 있어야 사용 기록이 생긴다.

## 배경

허용 목록 전환으로 학생은 공부 중에 쓸 앱을 스스로 고른다. 한도는 두지 않기로 했다. 대신 제품 철학(손실회피)에 따라 **남용하면 티가 나게** 만드는 것이 이 스펙의 일이다: 허용앱을 오래 쓰면 그만큼이 매니저 눈에 드러난다.

지금은 그럴 방법이 없다. 학습 세션(`sb_study_sessions`)은 시작과 끝만 남기므로, 3시간 학습이 3시간 집중인지 2시간 20분 유튜브인지 구분되지 않는다.

## 결정

**허용앱을 쓴 시간 구간을 기록하고, 학습 시간과 나란히 보여준다. 어떤 앱이었는지는 기록하지 않는다.**

세 가지 결정이 이 설계를 만든다.

**앱 이름을 저장하지 않는다.** 매니저가 "유튜브 40분"까지 아는 것은 사생활 침해다. 필요한 신호는 "고른 앱을 얼마나 오래 썼는가"이고 그것만으로 충분하다. 저장하지 않으면 유출될 것도, 나중에 화면에 새어 나올 것도 없다.

**허용앱 시간은 학습 시간에 포함된다.** 학생이 허용한 앱이니 공부의 일부로 본다. 다만 그 비율이 매니저에게 보인다 — "학습 3시간, 그중 허용앱 40분". 시간을 빼앗는 대신 드러내는 쪽이 철학에 맞는다.

**실시간 구독을 도입하지 않는다.** 아래 §5에서 자세히 다룬다.

## 범위

- 허용앱 사용 구간을 기록하는 테이블과 RLS
- 네이티브에서 구간을 감지해 상태에 쌓고, 웹이 서버로 비우는 경로
- 매니저 학생 목록의 요약 줄
- 오늘 타임라인에 사용 구간 겹쳐 그리기 (학생 화면에도 같이 보인다)
- 이제 항상 `false`인 `sb_study_sessions.deviated` 정리

**범위 밖:**

- **Supabase Realtime 구독** — §5의 결정에 따라 도입하지 않는다.
- **자동 통과 앱(전화·시계·설정·런처·시스템UI·키보드) 기록** — 전화를 받은 것을 딴짓으로 세면 안 된다. 학생이 직접 고른 `allowedApps`만 기록한다.
- **한도·경고·알림** — 허용 목록 스펙에서 "한도 없이, 기록으로 드러낸다"로 결정했다. 이 스펙은 드러내는 부분만 만든다.
- **과거 데이터 소급** — 기록이 없던 기간은 비어 있는 채로 둔다.

## 설계

### 1. 스키마

```sql
create table sb_allowed_app_intervals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at   timestamptz not null
);
create unique index sb_allowed_app_intervals_user_started_idx
  on sb_allowed_app_intervals (user_id, started_at);
```

인덱스를 **unique**로 둔 것이 재시도 안전장치다. 한 학생이 같은 시각에 두 번 허용앱에 들어갈 수 없으므로 `(user_id, started_at)`은 자연 키이고, 웹이 `upsert ... on conflict (user_id, started_at) do nothing`으로 넣으면 같은 구간을 두 번 보내도 행이 늘지 않는다.

RLS는 `sb_study_sessions`(마이그레이션 `0004`)와 같은 두 정책을 그대로 따른다 — 본인 전체 권한, 그리고 `sb_student_manager_links`를 통해 연결된 매니저의 읽기.

**패키지명 컬럼이 없다.** 이것이 이 설계의 사생활 보장이다.

**학습 세션과 외래키로 묶지 않는다.** 시각만 있으면 타임라인이 겹쳐 그릴 수 있고, 네이티브는 세션 ID를 알지 못하므로 묶으려면 웹이 시각으로 추측해야 한다. 추측해서 얻을 것이 없다.

구간은 **완료된 것만** 저장한다. 열린 구간은 네이티브 상태에만 있다가 닫힐 때 넘어온다.

### 2. 네이티브 — 구간 감지

허용 목록 스펙이 만든 `pendingPauseAtMillis` 표식과 같은 패턴을 쓴다. 이벤트가 아니라 상태에 쌓고 웹이 비운다 — 학생이 허용앱을 쓰는 동안 우리 앱은 백그라운드라 이벤트를 받을 컴포넌트가 없지만, 상태는 남아 다음에 처리된다.

`TimerState`에 두 필드를 더한다.

```kotlin
// 아직 진행 중인 구간의 시작 시각. 허용앱에 들어간 순간 세우고, 나오는 순간 지운다.
val allowedAppEnteredAtMillis: Long? = null,
// 닫힌 구간들. 웹이 서버로 보낸 뒤 비운다.
val allowedAppIntervals: List<AllowedAppInterval> = emptyList()
```

`AllowedAppInterval`은 `(startedAtMillis, endedAtMillis)` 두 필드짜리 `data class`다.

전이 함수는 전부 순수 함수로 두어 테스트한다.

| 함수 | 하는 일 |
|---|---|
| `withForegroundPackage(packageName, nowMillis)` | 허용앱이면 구간을 열고(이미 열려 있으면 그대로), 아니면 열린 구간을 `nowMillis`로 닫아 목록에 넣는다 |
| `withAllowedAppIntervalsCleared()` | 목록만 비운다. 열린 구간은 건드리지 않는다 |

열린 구간을 닫아야 하는 다른 두 시점도 같은 함수로 처리한다.

- `withSessionStopped()` — 공부가 끝나면 열린 구간을 닫는다
- `withBreakUntil(end, now)` — 쉬는 시간이 시작되면 닫는다. 쉬는 동안은 차단 자체가 없으므로 "허용앱을 썼다"는 개념이 성립하지 않는다

두 함수 모두 이미 존재하므로 닫는 동작만 더한다.

접근성 서비스는 차단 판정 **직전에** 이 갱신을 호출한다 — 차단 여부와 무관하게 모든 화면 전환에서 갱신되어야 하기 때문이다(허용앱은 차단되지 않으므로 차단 경로에 얹으면 영원히 기록되지 않는다). 공부 중이 아니거나 쉬는 시간이면 호출하지 않는다.

**계산 결과가 이전 상태와 같으면 저장하지 않는다.** 화면 전환은 자주 일어나고 저장은 SharedPreferences 쓰기 + Flow 방출을 부른다. 대부분의 이벤트는 이미 열린 구간을 그대로 두거나 닫을 구간이 없는 경우라 상태가 바뀌지 않으므로, `TimerStateStore`가 새 상태를 현재 값과 비교해 같으면 건너뛴다.

**한 구간의 상한.** 네이티브 학습 세션이 3시간에 자동 만료되므로 정직한 구간이 그보다 길 수 없다. 구간을 닫을 때 `SESSION_MAX_MILLIS`로 자른다 — 기기 시각이 앞으로 당겨진 경우까지 함께 막는다. 허용 목록 스펙의 최종 리뷰가 학습 시간에서 같은 문제를 잡았으므로, 처음부터 같은 방어를 넣는다.

### 3. 웹 — 서버로 비우기

`usePendingStudyPause`와 같은 자리, 같은 방식이다. `StudentAppShell`에서 부르는 훅 하나를 더한다 — 딴짓멈춰 오버레이가 떠서 학생 홈이 언마운트돼도 계속 돌아야 한다.

- `src/screens/student/allowedAppUsageModel.ts` — 순수 함수
  - `toIntervalRows(intervals, userId)`: 네이티브 구간을 삽입용 행으로 바꾼다. 길이가 0 이하인 구간은 버린다
  - `latestUsage(intervals, nowMillis)`: 오늘 총 사용 초와 마지막 종료 시각 — 매니저 화면 문구가 쓴다
- `src/screens/student/useAllowedAppUsageFlush.ts` — 위 함수와 `AppStateContext`를 엮는 훅

훅은 목록이 비어 있지 않으면 한 번에 삽입하고 `clearAllowedAppIntervals()`를 부른다. 삽입이 실패하면 목록이 남아 다음 기회에 다시 시도한다. 삽입은 성공했는데 비우기가 실패하면 다음 실행이 같은 구간을 또 보내는데, §1의 unique 인덱스와 `on conflict do nothing` 덕분에 그것이 중복 행을 만들지 않는다.

`AppStateContext`에 `allowedAppIntervals` 상태와 두 액션(`loadAllowedAppIntervals(studentId?)`, `recordAllowedAppIntervals(rows)`)을 더한다. 매니저가 학생을 열 때도 같은 로더를 쓴다 — 기존 `loadStudentPlannerItems`와 같은 패턴이다.

### 4. 매니저에게 보이는 곳

**학생 목록 요약 줄.** 지금 `오늘 숙제 3/5 완료` 한 줄이 있는 자리에 두 번째 줄을 더한다.

| 상황 | 문구 |
|---|---|
| 마지막 구간이 10분 이내에 끝남 | `N분 전까지 허용앱 사용` |
| 오늘 썼지만 10분보다 오래됨 | `오늘 허용앱 N분` |
| 오늘 사용 없음 | 줄을 표시하지 않는다 |

`N분 전`은 0분이면 `방금 전까지 허용앱 사용`으로 쓴다.

**오늘 타임라인.** `ChecklistTimeline`에 `allowedAppIntervals` prop을 더해 시간대 그리드에 옅은 띠를 겹쳐 그린다. 이 컴포넌트는 매니저 홈과 학생 스터디플래너가 함께 쓰므로 **학생에게도 자기 기록이 보인다.** 자기 시간이 어디로 갔는지 보이는 것이 손실회피에 맞고, 학생 본인의 데이터를 학생에게 숨길 이유가 없다.

**진행률 옆 요약.** 매니저 홈에 `학습 3시간 · 허용앱 40분` 형태로 한 줄. 두 값이 나란히 있어야 비율이 읽힌다.

### 5. 실시간을 하지 않는 이유

학생이 허용앱을 쓰는 동안 우리 앱은 백그라운드다. 네이티브 접근성 서비스는 살아 있지만, Supabase에 쓰려면 웹(JS)이 필요하고 안드로이드는 백그라운드 WebView의 타이머를 조이거나 멈춘다. 따라서 서버의 값은 **학생이 앱으로 돌아온 뒤에야** 최신이 된다.

진짜 실시간을 만들려면 Kotlin에서 Supabase REST를 직접 호출해야 하고, 그러려면 학생의 JWT를 네이티브로 넘겨 갱신까지 관리해야 한다. 얻는 것에 비해 범위와 보안 표면이 지나치게 커진다.

그래서 지연을 없애는 대신 **문구로 정직하게 드러낸다.** `3분 전까지`는 매니저가 화면을 열 때 조회한 값이고, 그 표현 자체가 "지금 이 순간"이 아님을 말한다. 늦은 값을 실시간처럼 보여주면 매니저가 잘못 믿게 된다.

### 6. `deviated` 정리

허용 목록 전환으로 이탈 감지가 사라진 뒤 `sb_study_sessions.deviated`에 `true`를 쓰는 호출부가 없다. 이 스펙이 그 자리를 대신하므로 컬럼과 `endStudySession`의 인자를 함께 삭제한다. 죽은 필드를 남기면 다음 사람이 의미를 추측한다.

마이그레이션에서 `drop column`, `AppStateContext.endStudySession`에서 인자 제거, 세 호출부 정리, `StudySession` 타입에서 필드 제거.

### 7. 데이터 마이그레이션

`TimerStateStore.fromJson`은 `runCatching { }.getOrDefault(TimerState.DEFAULT)`로 감싸여 있어 예외 하나가 학생의 허용앱 설정을 통째로 날린다. 새 키 `allowedAppEnteredAtMillis`와 `allowedAppIntervals`는 반드시 `has`/`isNull` 검사 후 읽고, 배열 파싱은 항목 단위로 `runCatching`으로 감싸 하나가 깨져도 나머지가 살아남게 한다.

기존 기기 JSON에는 두 키가 없으므로 각각 `null`과 빈 목록으로 시작한다. 별도 마이그레이션 코드는 필요 없다.

## 테스트

**JVM 단위 테스트** (`TimerStateTest`, Robolectric 없음 — 순수 함수만):

- `withForegroundPackage`: 허용앱 진입 → 구간이 열린다 / 같은 앱이 다시 이벤트를 내도 시작 시각이 덮이지 않는다 / 허용앱 아닌 앱으로 나가면 구간이 닫혀 목록에 들어간다 / 열린 구간이 없는데 나가도 아무 일 없다
- `withSessionStopped`와 `withBreakUntil`이 열린 구간을 닫는다
- 구간 길이가 `SESSION_MAX_MILLIS`로 잘린다
- `withAllowedAppIntervalsCleared`가 목록만 비우고 열린 구간은 남긴다

**vitest** (`allowedAppUsageModel.test.ts`):

- `toIntervalRows`: 길이 0 이하인 구간을 버린다 / 밀리초를 timestamptz 문자열로 바꾼다 / 같은 입력이면 같은 `started_at`을 만든다 — 재시도 시 §1의 unique 인덱스가 중복을 걸러내려면 이 값이 안정적이어야 한다
- `latestUsage`: 오늘 총합 / 마지막 종료 시각 / 오늘 기록이 없으면 null

**vitest** (매니저 요약 문구): 10분 이내 → `N분 전까지 허용앱 사용` / 0분 → `방금 전까지 허용앱 사용` / 10분 초과 → `오늘 허용앱 N분` / 없음 → null

**실기기 검증:**

1. 음악 앱을 허용앱으로 고르고 학습 타이머 시작
2. 음악 앱을 5분 열었다 앱으로 복귀 → 매니저 화면에 `방금 전까지 허용앱 사용`
3. 타임라인에 그 5분이 띠로 보인다
4. 전화를 5분 받고 복귀 → **기록되지 않는다**(자동 통과 앱)
5. 쉬는 시간 중 음악 앱 사용 → 기록되지 않는다
6. 공부 중 음악 앱을 연 채로 앱을 강제 종료 → 재실행 시 그 구간이 닫혀 기록된다

## 배포 주의

마이그레이션 `0020`을 Supabase에 먼저 적용해야 앱이 삽입에 성공한다. 네이티브 변경이 포함되므로 학생은 새 APK를 설치해야 한다. gradle은 JDK 21(`C:/Users/DELL/.jdks/jbr-21.0.11`)로 돌린다.
