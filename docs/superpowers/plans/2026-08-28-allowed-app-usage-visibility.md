# 허용앱 사용을 매니저에게 드러내기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생이 공부 중에 자기가 고른 허용앱을 쓴 시간 구간을 기록하고, 학습 시간과 나란히 매니저에게 보여준다 — 어떤 앱이었는지는 저장하지 않는다.

**Architecture:** 네이티브 접근성 서비스가 허용앱 진입/이탈을 감지해 완료된 구간을 `TimerState`에 쌓고, 셸 레벨 훅이 그것을 Supabase로 비운다(이미 검증된 `pendingPauseAtMillis` 표식과 같은 패턴). 매니저 화면은 조회 시점의 값을 "N분 전까지" 문구로 보여준다 — 실시간 구독은 도입하지 않는다.

**Tech Stack:** Kotlin(Capacitor 플러그인, AccessibilityService, SharedPreferences+JSON) / React 18 + TypeScript / Supabase(Postgres, RLS) / JUnit4(순수 함수만) / Vitest

**Spec:** `docs/superpowers/specs/2026-08-28-allowed-app-usage-visibility-design.md`

## Global Constraints

- UI 문구는 한국어, 코드·커밋 메시지는 영어. 이 저장소의 주석은 한국어와 영어가 섞여 있다 — **수정하는 파일의 주변 주석 언어를 따른다.**
- 새 의존성 추가 금지. Robolectric도 추가하지 않는다 — 안드로이드 `Context`가 필요한 클래스는 단위 테스트하지 않고, 테스트 가능한 로직은 `TimerState`의 순수 함수나 TS 순수 모듈로 옮긴다.
- 불변 패턴 유지: `TimerState`는 `data class` + `copy()`로만 변경한다.
- **패키지명을 저장하지 않는다.** 스키마·브리지 JSON·상태 어디에도 앱 이름이나 패키지명이 남아서는 안 된다. 이것이 이 기능의 사생활 보장이다.
- 한 구간의 길이는 `SESSION_MAX_MILLIS`(3시간)로 자른다.
- **`TimerStateStore.fromJson`은 `runCatching { }.getOrDefault(TimerState.DEFAULT)`로 감싸여 있다.** 예외 하나가 학생의 허용앱 설정을 전부 날린다. 새 JSON 키는 반드시 `has`/`isNull` 검사 후 읽고, 배열은 항목 단위로 `runCatching`으로 감싼다.
- gradle은 **JDK 21**로 돌린다. 기본 `JAVA_HOME`은 JDK 17이라 `invalid source release: 21`로 실패하고, Android Studio 내장 JBR은 JDK 25라 Gradle 8.14.3이 settings 스크립트를 컴파일할 때 `Unsupported class file major version 69`로 죽는다.

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

- gradle은 테스트 실패를 콘솔에 요약하지 않는다. 결과는 `android/app/build/test-results/testDebugUnitTest/*.xml`의 `failures`/`errors` 속성으로 확인한다.
- 웹 관문 세 개: `npx tsc --noEmit` 무출력, `npx vitest run` 전부 통과, `npx vite build` 성공.
- **다른 작업 흐름이 이 브랜치에 가끔 커밋한다.** 각 태스크의 `git add`에 적힌 파일만 스테이징한다. `git add -A` / `git add .` 금지.

## 스펙에서 두 가지를 교정한다

**1. 마이그레이션을 둘로 나눈다.** 스펙 §6은 `deviated` 컬럼 삭제를 이 변경에 포함시킨다. 그런데 컬럼을 지우는 순간, 아직 배포되어 있는 **구버전 앱**이 학습 세션을 끝낼 때마다 `.update({ deviated })`로 실패한다. 그래서:

- `supabase/migrations/0020_allowed_app_intervals.sql` — 새 테이블만. **배포 전에** 적용한다.
- `supabase/deferred-migrations/0021_drop_study_session_deviated.sql` — 컬럼 삭제. **모든 학생이 새 APK를 설치한 뒤에** 적용한다.

`0021`은 `supabase/migrations/`에 두지 않는다. 배포 주의 문구만으로는 부족하기 때문이다 — 밀린 마이그레이션을 순서대로 적용하는 사람은 `0020`과 `0021`을 함께 적용하게 되고, 아직 구버전 APK를 쓰는 학생들은 학습 시간이 통째로 기록되지 않는다(구버전 앱은 세션 insert와 update 양쪽에서 `deviated`에 쓴다). 아예 다른 폴더에 두어 일괄 적용이 불가능하게 만든다. 전제 조건과 적용 절차는 `supabase/deferred-migrations/README.md`에 있다.

**2. `deviated` 삭제 범위가 스펙이 쓴 것보다 넓다.** 스펙은 "컬럼과 인자"라고 했지만 이 값은 UI까지 흐른다 — `TimelineColumn.tsx:44`가 이 값으로 세그먼트를 빨갛게 칠한다. `true`를 쓰는 곳이 없어져 실제로는 절대 뜨지 않는 색이므로 함께 지운다. 전체 목록은 Task 1에 있다.

**3. 모델 파일 위치.** 스펙 §3은 `src/screens/student/allowedAppUsageModel.ts`를 지정했지만, 매니저 화면도 `latestUsage`와 요약 문구를 쓴다. 학생 폴더에서 매니저가 import하는 모양이 어색하므로 `src/screens/shared/allowedAppUsageModel.ts`에 둔다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `supabase/migrations/0020_allowed_app_intervals.sql` | 새 테이블 + RLS + unique 인덱스 | **신규** |
| `supabase/deferred-migrations/0021_drop_study_session_deviated.sql` | 죽은 컬럼 삭제(보류) | **신규** |
| `src/types/db.ts` | DB 행 타입 | 수정 |
| `src/types/index.ts` | 도메인 타입 | 수정 |
| `src/state/mappers.ts` | 행 → 도메인 변환 | 수정 |
| `src/lib.ts` / `src/lib.test.ts` | 타임라인 블록 생성 | 수정 |
| `src/screens/shared/TimelineColumn.tsx` | 시간대 격자 렌더 | 수정 |
| `src/screens/shared/ChecklistTimeline.tsx` | 체크리스트 + 격자 조합 | 수정 |
| `android/.../distraction/AllowedAppInterval.kt` | 구간 값 객체 | **신규** |
| `android/.../distraction/TimerState.kt` | 구간 감지 순수 함수 | 수정 |
| `android/app/src/test/.../TimerStateTest.kt` | 위 테스트 | 수정 |
| `android/.../distraction/TimerStateStore.kt` | 영속화, 변화 없으면 저장 생략 | 수정 |
| `android/.../distraction/DistractionStopPlugin.kt` | 브리지 | 수정 |
| `android/.../distraction/service/ForegroundAppAccessibilityService.kt` | 화면 전환 감지 | 수정 |
| `src/types/distraction.ts` | 브리지 상태 타입 | 수정 |
| `src/native/distractionStop.ts` | 플러그인 인터페이스 | 수정 |
| `src/screens/shared/allowedAppUsageModel.ts` | 전송 행 변환·요약 판정(순수) | **신규** |
| `src/screens/shared/allowedAppUsageModel.test.ts` | 위 테스트 | **신규** |
| `src/screens/student/useAllowedAppUsageFlush.ts` | 구간을 서버로 비우는 훅 | **신규** |
| `src/state/AppStateContext.tsx` | 상태 + 로더 + 기록 액션 | 수정 |
| `src/App.tsx` | 셸에서 훅 호출 | 수정 |
| `src/screens/manager/ManagerStudentList.tsx` | 요약 줄 | 수정 |
| `src/screens/manager/ManagerHome.tsx` | 학습·허용앱 요약 + 타임라인 prop | 수정 |
| `src/screens/student/StudentPlanner.tsx` | 타임라인 prop | 수정 |

---

### Task 1: 스키마와 죽은 `deviated` 제거

`deviated`가 DB·타입·매퍼·타임라인 UI까지 흐르므로 한 번에 지워야 컴파일된다. 한 커밋으로 마무리한다.

**Files:**
- Create: `supabase/migrations/0020_allowed_app_intervals.sql`
- Create: `supabase/deferred-migrations/0021_drop_study_session_deviated.sql`
- Modify: `src/types/db.ts`, `src/types/index.ts`, `src/state/mappers.ts`, `src/state/AppStateContext.tsx`
- Modify: `src/lib.ts`, `src/screens/shared/TimelineColumn.tsx`, `src/screens/shared/ChecklistTimeline.tsx`
- Modify: `src/screens/student/StudentHome.tsx`
- Test: `src/lib.test.ts`, `src/screens/student/pendingPauseModel.test.ts`, `src/screens/student/studentHomeModel.test.ts`

**Interfaces:**
- Produces:
  - 테이블 `sb_allowed_app_intervals (id, user_id, started_at, ended_at)` + unique 인덱스 `(user_id, started_at)`
  - `StudySession`에서 `deviated: boolean` **삭제**
  - `TimelineBlock`에서 `deviated: boolean` **삭제**
  - `TimelineSegment`에서 `deviated: boolean` **삭제**
  - `AppStateContext.endStudySession(plannerItemId, sessionId, displayedSeconds?)` — `deviated` 인자 **삭제**

- [ ] **Step 1: 마이그레이션 두 개를 만든다**

`supabase/migrations/0020_allowed_app_intervals.sql`:

```sql
-- 학생이 공부 중에 자기가 고른 허용앱을 쓴 시간 구간.
-- 어떤 앱이었는지는 저장하지 않는다 — 매니저에게 필요한 신호는 "얼마나 오래"이지
-- "무엇을"이 아니고, 저장하지 않으면 새어 나갈 것도 없다.
create table sb_allowed_app_intervals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null
);
alter table sb_allowed_app_intervals enable row level security;

create policy "student manages own allowed app intervals" on sb_allowed_app_intervals for all using (
  auth.uid() = user_id
) with check (
  auth.uid() = user_id
);

create policy "linked manager reads allowed app intervals" on sb_allowed_app_intervals for select using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_allowed_app_intervals.user_id and l.manager_id = auth.uid())
);

-- 한 학생이 같은 시각에 두 번 허용앱에 들어갈 수 없으므로 (user_id, started_at)이 자연 키다.
-- 웹이 on conflict do nothing으로 넣으면 전송을 재시도해도 행이 늘지 않는다.
create unique index sb_allowed_app_intervals_user_started_idx
  on sb_allowed_app_intervals (user_id, started_at);
```

`supabase/deferred-migrations/0021_drop_study_session_deviated.sql`:

```sql
-- 이탈 감지가 허용 목록 전환으로 사라진 뒤 이 컬럼에 true를 쓰는 코드가 없다.
-- 구버전 앱이 세션 종료 시 이 컬럼에 쓰므로, 새 앱이 배포된 뒤에 적용할 것.
alter table sb_study_sessions drop column deviated;
```

- [ ] **Step 2: 타입과 매퍼에서 `deviated`를 지운다**

`src/types/db.ts:110`, `src/types/index.ts:181`, `src/state/mappers.ts:133`에서 각각 `deviated` 줄을 삭제한다.

- [ ] **Step 3: `AppStateContext`에서 인자와 사용처를 지운다**

인터페이스 선언(`src/state/AppStateContext.tsx:147`)을 바꾼다.

```ts
  endStudySession: (plannerItemId: string, sessionId: string, displayedSeconds?: number) => Promise<void>;
```

구현(`AppStateContext.tsx:914` 부근)의 시그니처에서 `deviated`를 빼고, 낙관적 갱신(`:931`)과 DB 업데이트(`:937`)에서도 뺀다.

```ts
      async endStudySession(plannerItemId, sessionId, displayedSeconds) {
```

```ts
          const updated = list.map((sess) => (sess.id === sessionId ? { ...sess, endedAt, durationSeconds } : sess));
```

```ts
          .update({ ended_at: endedAt, duration_seconds: durationSeconds })
```

세션 생성 시 낙관적으로 넣던 `deviated: false`(`:886`, `:903`)도 지운다.

- [ ] **Step 4: 타임라인에서 `deviated`를 지운다**

`src/lib.ts:271-276`의 `TimelineBlock`에서 `deviated: boolean;` 줄을 삭제하고, `sessionsToTimelineBlocks`(`:302`)의 `deviated: session.deviated,` 줄도 삭제한다.

`src/screens/shared/TimelineColumn.tsx`의 `TimelineSegment`에서 `deviated: boolean;`을 삭제하고, 셀 스타일에서 조건 분기를 없앤다.

```tsx
                  style={seg ? { backgroundColor: seg.color, opacity: 0.8 } : undefined}
```

`src/screens/shared/ChecklistTimeline.tsx:49`에서 `deviated: session.deviated` 항목을 삭제한다.

- [ ] **Step 5: `endStudySession` 호출부를 고친다**

`src/screens/student/StudentHome.tsx`에 두 곳 있다. 세 번째 인자로 넘기던 `false`를 빼면 `displayedSeconds`가 세 번째 자리로 온다.

```tsx
      void actions.endStudySession(stale.itemId, stale.sessionId, stale.durationSeconds);
```

```tsx
    actions.endStudySession(itemId, sessionId, displayedSeconds);
```

`src/screens/student/usePendingStudyPause.ts`에도 한 곳 있다 — `false` 인자를 뺀다.

- [ ] **Step 6: 테스트 픽스처를 고친다**

`src/lib.test.ts`에서 `deviated`를 쓰는 네 곳을 정리한다. `:331`, `:338`, `:346`의 `deviated: false`를 지우고, `:357-361`의 `marks deviated sessions` 테스트 전체를 삭제한다 — 지워진 필드를 검사하는 테스트다.

`src/screens/student/pendingPauseModel.test.ts:10`과 `src/screens/student/studentHomeModel.test.ts:38`의 `deviated: false,` 줄을 지운다.

- [ ] **Step 7: 세 관문을 통과시킨다**

```bash
npx tsc --noEmit
```

Expected: 출력 없음. 남은 `deviated` 참조가 있으면 여기서 잡힌다.

```bash
npx vitest run
```

Expected: 전부 PASS. `lib.test.ts`에서 테스트 하나가 줄어든다.

```bash
npx vite build
```

Expected: `built in ...`.

- [ ] **Step 8: 커밋**

```bash
git add supabase/migrations/0020_allowed_app_intervals.sql supabase/deferred-migrations/0021_drop_study_session_deviated.sql supabase/deferred-migrations/README.md src/types/db.ts src/types/index.ts src/state/mappers.ts src/state/AppStateContext.tsx src/lib.ts src/lib.test.ts src/screens/shared/TimelineColumn.tsx src/screens/shared/ChecklistTimeline.tsx src/screens/student/StudentHome.tsx src/screens/student/usePendingStudyPause.ts src/screens/student/pendingPauseModel.test.ts src/screens/student/studentHomeModel.test.ts
git commit -m "feat: add the allowed-app interval table and drop the dead deviated flag"
```

---

### Task 2: 네이티브 — 허용앱 구간 감지

**Files:**
- Create: `android/app/src/main/java/com/studybuddy/app/distraction/AllowedAppInterval.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/TimerState.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/TimerStateStore.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/service/ForegroundAppAccessibilityService.kt`
- Test: `android/app/src/test/java/com/studybuddy/app/distraction/TimerStateTest.kt`

**Interfaces:**
- Consumes: `TimerState.isSessionActive(now)`, `isBreakActive(now)`, `allowedApps: Set<String>`, `SESSION_MAX_MILLIS`, `withSessionStopped()`, `withBreakUntil(end, now)` — 전부 이미 있음
- Produces:
  - `data class AllowedAppInterval(val startedAtMillis: Long, val endedAtMillis: Long)`
  - `TimerState`에 `allowedAppEnteredAtMillis: Long? = null`, `allowedAppIntervals: List<AllowedAppInterval> = emptyList()`
  - `fun withForegroundPackage(packageName: String, nowMillis: Long): TimerState`
  - `fun withAllowedAppIntervalsCleared(): TimerState`
  - `TimerStateStore.updateForegroundPackage(packageName, nowMillis)`, `clearAllowedAppIntervals()`
  - 플러그인 메서드 `clearAllowedAppIntervals`, 브리지 JSON에 `allowedAppIntervals: { startedAtMillis, endedAtMillis }[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`TimerStateTest.kt` 맨 아래 `DEFAULT` 테스트 앞에 아래를 넣는다. 파일에 이미 있는 `base`, `studying(startedAt)`, `passThrough` 헬퍼를 그대로 쓴다.

```kotlin
    // --- 허용앱 사용 구간 ---

    private fun studyingWithMusic(startedAt: Long = 0L) =
        base.copy(allowedApps = setOf(MUSIC)).withSessionStarted(nowMillis = startedAt)

    @Test
    fun `withForegroundPackage opens an interval when the student enters an allowed app`() {
        val state = studyingWithMusic().withForegroundPackage(MUSIC, nowMillis = 1_000L)
        assertEquals(1_000L, state.allowedAppEnteredAtMillis)
        assertTrue(state.allowedAppIntervals.isEmpty())
    }

    // 같은 앱 안에서도 화면 전환 이벤트는 여러 번 온다. 매번 시작 시각을 덮으면 구간이
    // 계속 짧아져 사용 시간이 실제보다 적게 기록된다.
    @Test
    fun `withForegroundPackage does not restart an interval that is already open`() {
        val state = studyingWithMusic()
            .withForegroundPackage(MUSIC, nowMillis = 1_000L)
            .withForegroundPackage(MUSIC, nowMillis = 5_000L)
        assertEquals(1_000L, state.allowedAppEnteredAtMillis)
    }

    @Test
    fun `withForegroundPackage closes the interval when the student leaves for another app`() {
        val state = studyingWithMusic()
            .withForegroundPackage(MUSIC, nowMillis = 1_000L)
            .withForegroundPackage("com.studybuddy.app", nowMillis = 61_000L)
        assertNull(state.allowedAppEnteredAtMillis)
        assertEquals(listOf(AllowedAppInterval(1_000L, 61_000L)), state.allowedAppIntervals)
    }

    @Test
    fun `withForegroundPackage does nothing when no interval is open`() {
        val state = studyingWithMusic().withForegroundPackage("com.kakao.talk", nowMillis = 1_000L)
        assertNull(state.allowedAppEnteredAtMillis)
        assertTrue(state.allowedAppIntervals.isEmpty())
    }

    // 학습 세션이 3시간에 만료되므로 정직한 구간이 그보다 길 수 없다. 기기 시각이 앞으로
    // 당겨진 경우도 이 상한이 함께 막는다.
    @Test
    fun `a closed interval is capped at the session maximum`() {
        val state = studyingWithMusic()
            .withForegroundPackage(MUSIC, nowMillis = 0L)
            .withForegroundPackage("com.kakao.talk", nowMillis = TimerState.SESSION_MAX_MILLIS * 2)
        assertEquals(listOf(AllowedAppInterval(0L, TimerState.SESSION_MAX_MILLIS)), state.allowedAppIntervals)
    }

    @Test
    fun `withSessionStopped closes an open interval`() {
        val state = studyingWithMusic().withForegroundPackage(MUSIC, nowMillis = 1_000L).withSessionStopped(nowMillis = 61_000L)
        assertNull(state.allowedAppEnteredAtMillis)
        assertEquals(listOf(AllowedAppInterval(1_000L, 61_000L)), state.allowedAppIntervals)
    }

    // 쉬는 동안은 차단 자체가 없으므로 "허용앱을 썼다"는 개념이 성립하지 않는다.
    @Test
    fun `withBreakUntil closes an open interval`() {
        val state = studyingWithMusic()
            .withForegroundPackage(MUSIC, nowMillis = 1_000L)
            .withBreakUntil(endTimeMillis = 300_000L, nowMillis = 61_000L)
        assertNull(state.allowedAppEnteredAtMillis)
        assertEquals(listOf(AllowedAppInterval(1_000L, 61_000L)), state.allowedAppIntervals)
    }

    @Test
    fun `withAllowedAppIntervalsCleared empties the list but keeps an open interval`() {
        val state = studyingWithMusic()
            .withForegroundPackage(MUSIC, nowMillis = 1_000L)
            .withForegroundPackage("com.kakao.talk", nowMillis = 61_000L)
            .withForegroundPackage(MUSIC, nowMillis = 120_000L)
            .withAllowedAppIntervalsCleared()
        assertTrue(state.allowedAppIntervals.isEmpty())
        assertEquals(120_000L, state.allowedAppEnteredAtMillis)
    }
```

파일 위쪽의 헬퍼 옆에 상수를 더한다.

```kotlin
    private val MUSIC = "com.spotify.music"
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: 컴파일 실패. `AllowedAppInterval`이 없고, `TimerState`에 `withForegroundPackage`·`withAllowedAppIntervalsCleared`·두 필드가 없으며, `withSessionStopped`가 인자를 받지 않는다.

- [ ] **Step 3: `AllowedAppInterval.kt`를 만든다**

```kotlin
package com.studybuddy.app.distraction

// 학생이 공부 중에 허용앱에 머문 한 구간. 어떤 앱이었는지는 담지 않는다 — 매니저에게
// 필요한 신호는 "얼마나 오래"이지 "무엇을"이 아니고, 담지 않으면 새어 나갈 것도 없다.
data class AllowedAppInterval(val startedAtMillis: Long, val endedAtMillis: Long)
```

- [ ] **Step 4: `TimerState`에 필드와 전이 함수를 더한다**

필드 두 개를 `pendingPauseAtMillis` 아래에 더한다.

```kotlin
    // 아직 진행 중인 허용앱 구간의 시작 시각. 허용앱에 들어간 순간 세우고 나오는 순간 지운다.
    val allowedAppEnteredAtMillis: Long? = null,
    // 닫힌 구간들. 웹이 서버로 보낸 뒤 비운다. 이벤트가 아니라 상태인 이유는
    // pendingPauseAtMillis와 같다 — 학생이 허용앱을 쓰는 동안 우리 앱은 백그라운드다.
    val allowedAppIntervals: List<AllowedAppInterval> = emptyList()
```

전이 함수를 더한다.

```kotlin
    // 화면 전환마다 불린다. 허용앱이면 구간을 열고(이미 열려 있으면 그대로), 아니면 열린
    // 구간을 닫는다. 자동 통과 앱(전화·시계·설정 등)은 allowedApps에 없으므로 여기서
    // 구간을 닫는 쪽으로 처리된다 — 전화를 받은 것을 딴짓으로 세면 안 된다.
    fun withForegroundPackage(packageName: String, nowMillis: Long): TimerState =
        if (packageName in allowedApps) {
            if (allowedAppEnteredAtMillis != null) this else copy(allowedAppEnteredAtMillis = nowMillis)
        } else {
            closeOpenAllowedAppInterval(nowMillis)
        }

    fun withAllowedAppIntervalsCleared(): TimerState = copy(allowedAppIntervals = emptyList())

    // 학습 세션이 3시간에 만료되므로 정직한 구간이 그보다 길 수 없다. 상한을 두면 기기
    // 시각이 앞으로 당겨진 경우도 함께 막힌다.
    private fun closeOpenAllowedAppInterval(nowMillis: Long): TimerState {
        val startedAt = allowedAppEnteredAtMillis ?: return this
        val endedAt = minOf(nowMillis, startedAt + SESSION_MAX_MILLIS)
        return copy(
            allowedAppEnteredAtMillis = null,
            allowedAppIntervals = allowedAppIntervals + AllowedAppInterval(startedAt, endedAt)
        )
    }
```

`withSessionStopped`와 `withBreakUntil`이 열린 구간을 닫게 바꾼다. `withSessionStopped`는 시각이 필요해지므로 인자를 받는다.

```kotlin
    fun withSessionStopped(nowMillis: Long): TimerState =
        closeOpenAllowedAppInterval(nowMillis)
            .copy(sessionActive = false, sessionStartedAtMillis = null, pendingPauseAtMillis = null)

    fun withBreakUntil(endTimeMillis: Long, nowMillis: Long): TimerState {
        val next = closeOpenAllowedAppInterval(nowMillis).copy(endTimeMillis = endTimeMillis)
        return if (sessionActive && pendingPauseAtMillis == null) {
            next.copy(pendingPauseAtMillis = nowMillis)
        } else {
            next
        }
    }
```

`withSessionStarted`는 새 세션을 여는 것이므로 남은 구간 상태를 초기화한다.

```kotlin
    fun withSessionStarted(nowMillis: Long): TimerState =
        copy(
            sessionActive = true,
            sessionStartedAtMillis = nowMillis,
            endTimeMillis = null,
            pendingPauseAtMillis = null,
            allowedAppEnteredAtMillis = null
        )
```

`DEFAULT`에도 두 필드를 명시한다.

```kotlin
            pendingPauseAtMillis = null,
            allowedAppEnteredAtMillis = null,
            allowedAppIntervals = emptyList()
```

- [ ] **Step 5: `TimerStateStore`를 고친다**

`withSessionStopped`가 인자를 받게 됐으므로 `setSessionActive`를 고치고, 두 메서드를 더하고, `save`가 변화 없으면 건너뛰게 한다.

```kotlin
    suspend fun setSessionActive(active: Boolean, nowMillis: Long = System.currentTimeMillis()) {
        val current = currentState()
        save(if (active) current.withSessionStarted(nowMillis) else current.withSessionStopped(nowMillis))
    }

    suspend fun updateForegroundPackage(packageName: String, nowMillis: Long = System.currentTimeMillis()) {
        save(currentState().withForegroundPackage(packageName, nowMillis))
    }

    suspend fun clearAllowedAppIntervals() {
        save(currentState().withAllowedAppIntervalsCleared())
    }
```

`save`에 변화 검사를 넣는다. 화면 전환은 자주 일어나고 대부분의 이벤트는 상태를 바꾸지 않는데, 그때마다 SharedPreferences 쓰기와 Flow 방출이 일어나면 낭비다.

```kotlin
    private fun save(state: TimerState) {
        // 화면 전환마다 updateForegroundPackage가 불리지만 대부분은 상태를 바꾸지 않는다.
        // 같은 값이면 디스크 쓰기도 Flow 방출도 하지 않는다.
        if (state == stateFlow.value) return
        prefs.edit().putString(KEY_STATE, toJson(state)).apply()
        stateFlow.value = state
    }
```

JSON에 두 키를 더한다. `toJson`:

```kotlin
        json.put("allowedAppEnteredAtMillis", state.allowedAppEnteredAtMillis ?: JSONObject.NULL)
        json.put(
            "allowedAppIntervals",
            JSONArray(
                state.allowedAppIntervals.map { interval ->
                    JSONObject().put("startedAtMillis", interval.startedAtMillis).put("endedAtMillis", interval.endedAtMillis)
                }
            )
        )
```

`fromJson`에서 읽는다. **항목 단위로 `runCatching`을 씌워** 하나가 깨져도 나머지가 살아남게 한다 — 이 함수 전체가 `runCatching { }.getOrDefault(DEFAULT)`로 감싸여 있어 예외 하나가 학생의 허용앱 설정을 통째로 날린다.

```kotlin
        val intervals = mutableListOf<AllowedAppInterval>()
        if (json.has("allowedAppIntervals") && !json.isNull("allowedAppIntervals")) {
            val array = json.getJSONArray("allowedAppIntervals")
            for (i in 0 until array.length()) {
                runCatching {
                    val item = array.getJSONObject(i)
                    AllowedAppInterval(item.getLong("startedAtMillis"), item.getLong("endedAtMillis"))
                }.getOrNull()?.let { intervals.add(it) }
            }
        }
```

그리고 `TimerState(...)` 생성에 두 인자를 더한다.

```kotlin
            allowedAppEnteredAtMillis = optLongOrNull(json, "allowedAppEnteredAtMillis"),
            allowedAppIntervals = intervals
```

- [ ] **Step 6: 플러그인에 메서드와 JSON을 더한다**

```kotlin
    @PluginMethod
    fun clearAllowedAppIntervals(call: PluginCall) {
        scope.launch {
            store.clearAllowedAppIntervals()
            call.resolve(store.observeState().value.toJSObject())
        }
    }
```

`toJSObject`에 두 키를 더한다.

```kotlin
        obj.put("allowedAppEnteredAtMillis", allowedAppEnteredAtMillis ?: JSObject.NULL)
        obj.put(
            "allowedAppIntervals",
            com.getcapacitor.JSArray(
                allowedAppIntervals.map { interval ->
                    JSObject().put("startedAtMillis", interval.startedAtMillis).put("endedAtMillis", interval.endedAtMillis)
                }
            )
        )
```

- [ ] **Step 7: 접근성 서비스가 구간을 갱신하게 한다**

`onAccessibilityEvent`의 `scope.launch` 안, 통화 중 조기 반환 **다음**이자 차단 판정 **앞**에 넣는다. 차단 여부와 무관하게 모든 화면 전환에서 갱신되어야 한다 — 허용앱은 차단되지 않으므로 차단 경로에 얹으면 영원히 기록되지 않는다.

```kotlin
            // 허용앱 사용 구간 기록. 공부 중이고 쉬는 시간이 아닐 때만 의미가 있다.
            // 차단 판정보다 앞에 있어야 하는 이유: 허용앱은 차단되지 않으므로 차단 경로
            // 뒤에 두면 기록될 기회가 없다.
            if (state.isSessionActive(now) && !state.isBreakActive(now)) {
                store.updateForegroundPackage(packageName, now)
            }
```

- [ ] **Step 8: 테스트를 돌려 전부 통과하는지 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: `BUILD SUCCESSFUL`. 개수를 확인한다.

```bash
cd android && grep -o 'name="com[^"]*" tests="[0-9]*" skipped="[0-9]*" failures="[0-9]*" errors="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml
```

Expected: `TimerStateTest` 35개, `ExitHandlerTest` 3개, `ExampleUnitTest` 1개, 전부 `failures="0" errors="0"`.

- [ ] **Step 9: 커밋**

```bash
git add android/app/src/main/java/com/studybuddy/app/distraction/AllowedAppInterval.kt android/app/src/main/java/com/studybuddy/app/distraction/TimerState.kt android/app/src/main/java/com/studybuddy/app/distraction/TimerStateStore.kt android/app/src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt android/app/src/main/java/com/studybuddy/app/distraction/service/ForegroundAppAccessibilityService.kt android/app/src/test/java/com/studybuddy/app/distraction/TimerStateTest.kt
git commit -m "feat: record how long the student spends in their allowed apps"
```

---

### Task 3: 웹 모델 — 전송 행 변환과 요약 판정

**Files:**
- Modify: `src/types/distraction.ts`
- Modify: `src/native/distractionStop.ts`
- Create: `src/screens/shared/allowedAppUsageModel.ts`
- Test: `src/screens/shared/allowedAppUsageModel.test.ts`

**Interfaces:**
- Consumes: Task 2의 브리지 JSON (`allowedAppEnteredAtMillis`, `allowedAppIntervals`), 플러그인 메서드 `clearAllowedAppIntervals`
- Produces:
  - `src/types/distraction.ts`: `interface NativeAllowedAppInterval { startedAtMillis: number; endedAtMillis: number }`, `DistractionState`에 `allowedAppEnteredAtMillis: number | null`과 `allowedAppIntervals: NativeAllowedAppInterval[]`
  - `src/types/index.ts`: `interface AllowedAppInterval { id: string; userId: string; startedAt: string; endedAt: string }`
  - `toIntervalRows(intervals: NativeAllowedAppInterval[], userId: string): { user_id: string; started_at: string; ended_at: string }[]`
  - `totalUsageSeconds(intervals: AllowedAppInterval[]): number`
  - `lastUsageEndMillis(intervals: AllowedAppInterval[]): number | null`
  - `allowedAppSummary(intervals: AllowedAppInterval[], nowMillis: number): string | null`

- [ ] **Step 1: 타입을 더한다**

`src/types/distraction.ts`에 추가하고 `DistractionState`에 두 필드를 더한다.

```ts
export interface NativeAllowedAppInterval {
  startedAtMillis: number;
  endedAtMillis: number;
}
```

```ts
  // 아직 진행 중인 허용앱 구간의 시작 시각.
  allowedAppEnteredAtMillis: number | null;
  // 닫힌 구간들. 웹이 서버로 보낸 뒤 clearAllowedAppIntervals로 비운다.
  allowedAppIntervals: NativeAllowedAppInterval[];
```

`src/types/index.ts`에 서버 쪽 도메인 타입을 더한다.

```ts
export interface AllowedAppInterval {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string;
}
```

`src/native/distractionStop.ts`의 플러그인 인터페이스에 한 줄 더한다.

```ts
  clearAllowedAppIntervals(): Promise<DistractionState>;
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`src/screens/shared/allowedAppUsageModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  allowedAppSummary,
  lastUsageEndMillis,
  toIntervalRows,
  totalUsageSeconds,
} from './allowedAppUsageModel';
import type { AllowedAppInterval } from '../../types';

const interval = (startedAt: string, endedAt: string): AllowedAppInterval => ({
  id: `${startedAt}-${endedAt}`,
  userId: 'student-1',
  startedAt,
  endedAt,
});

describe('toIntervalRows', () => {
  it('converts native millisecond intervals into insertable rows', () => {
    const rows = toIntervalRows([{ startedAtMillis: 0, endedAtMillis: 60_000 }], 'student-1');
    expect(rows).toEqual([
      {
        user_id: 'student-1',
        started_at: new Date(0).toISOString(),
        ended_at: new Date(60_000).toISOString(),
      },
    ]);
  });

  // 같은 started_at을 안정적으로 만들어야 재전송 시 unique 인덱스가 중복을 걸러낸다.
  it('produces the same started_at for the same input', () => {
    const once = toIntervalRows([{ startedAtMillis: 1_000, endedAtMillis: 2_000 }], 'student-1');
    const twice = toIntervalRows([{ startedAtMillis: 1_000, endedAtMillis: 2_000 }], 'student-1');
    expect(once[0].started_at).toBe(twice[0].started_at);
  });

  it('drops intervals with no length', () => {
    const rows = toIntervalRows(
      [
        { startedAtMillis: 0, endedAtMillis: 0 },
        { startedAtMillis: 5_000, endedAtMillis: 1_000 },
      ],
      'student-1'
    );
    expect(rows).toEqual([]);
  });
});

describe('totalUsageSeconds', () => {
  it('adds every interval', () => {
    const total = totalUsageSeconds([
      interval('2026-08-28T10:00:00.000Z', '2026-08-28T10:05:00.000Z'),
      interval('2026-08-28T11:00:00.000Z', '2026-08-28T11:10:00.000Z'),
    ]);
    expect(total).toBe(900);
  });

  it('is zero with no intervals', () => {
    expect(totalUsageSeconds([])).toBe(0);
  });
});

describe('lastUsageEndMillis', () => {
  it('takes the latest end, not the last element', () => {
    const last = lastUsageEndMillis([
      interval('2026-08-28T11:00:00.000Z', '2026-08-28T11:10:00.000Z'),
      interval('2026-08-28T10:00:00.000Z', '2026-08-28T10:05:00.000Z'),
    ]);
    expect(last).toBe(Date.parse('2026-08-28T11:10:00.000Z'));
  });

  it('is null with no intervals', () => {
    expect(lastUsageEndMillis([])).toBeNull();
  });
});

describe('allowedAppSummary', () => {
  const now = Date.parse('2026-08-28T11:13:00.000Z');

  it('says how long ago when the usage just ended', () => {
    const intervals = [interval('2026-08-28T11:05:00.000Z', '2026-08-28T11:10:00.000Z')];
    expect(allowedAppSummary(intervals, now)).toBe('3분 전까지 허용앱 사용');
  });

  it('says 방금 when the usage ended less than a minute ago', () => {
    const intervals = [interval('2026-08-28T11:10:00.000Z', '2026-08-28T11:12:30.000Z')];
    expect(allowedAppSummary(intervals, now)).toBe('방금 전까지 허용앱 사용');
  });

  // 10분이 넘으면 "방금까지"라고 부르기 어렵다. 그때부터는 오늘 총량이 더 쓸모 있다.
  it('falls back to the daily total once the usage is old', () => {
    const intervals = [interval('2026-08-28T09:00:00.000Z', '2026-08-28T09:40:00.000Z')];
    expect(allowedAppSummary(intervals, now)).toBe('오늘 허용앱 40분');
  });

  it('is null when there is no usage', () => {
    expect(allowedAppSummary([], now)).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인한다**

```bash
npx vitest run src/screens/shared/allowedAppUsageModel.test.ts
```

Expected: FAIL — `./allowedAppUsageModel`을 찾을 수 없다.

- [ ] **Step 4: 모델을 구현한다**

`src/screens/shared/allowedAppUsageModel.ts`:

```ts
import type { AllowedAppInterval } from '../../types';
import type { NativeAllowedAppInterval } from '../../types/distraction';

// 마지막 사용이 이 시간 안에 끝났으면 "N분 전까지", 넘으면 오늘 총량을 보여준다.
const RECENT_WINDOW_MILLIS = 10 * 60 * 1000;

// 네이티브가 밀리초로 준 구간을 삽입용 행으로 바꾼다. started_at은 (user_id, started_at)
// unique 인덱스의 절반이므로 같은 입력에서 항상 같은 값이 나와야 재전송이 안전하다.
export function toIntervalRows(
  intervals: NativeAllowedAppInterval[],
  userId: string
): { user_id: string; started_at: string; ended_at: string }[] {
  return intervals
    .filter((i) => i.endedAtMillis > i.startedAtMillis)
    .map((i) => ({
      user_id: userId,
      started_at: new Date(i.startedAtMillis).toISOString(),
      ended_at: new Date(i.endedAtMillis).toISOString(),
    }));
}

export function totalUsageSeconds(intervals: AllowedAppInterval[]): number {
  return intervals.reduce(
    (sum, i) => sum + Math.max(0, Math.floor((Date.parse(i.endedAt) - Date.parse(i.startedAt)) / 1000)),
    0
  );
}

// 배열 순서를 믿지 않는다 — 서버 정렬이 바뀌어도 맞아야 한다.
export function lastUsageEndMillis(intervals: AllowedAppInterval[]): number | null {
  if (intervals.length === 0) return null;
  return intervals.reduce((max, i) => Math.max(max, Date.parse(i.endedAt)), 0);
}

// 매니저 학생 목록의 두 번째 줄. "지금 사용 중"이라고 쓰지 않는 이유는, 학생이 허용앱을
// 쓰는 동안 우리 앱은 백그라운드라 서버 값이 그만큼 늦기 때문이다. 문구가 그 지연을
// 정직하게 드러내야 매니저가 잘못 믿지 않는다.
export function allowedAppSummary(intervals: AllowedAppInterval[], nowMillis: number): string | null {
  const lastEnd = lastUsageEndMillis(intervals);
  if (lastEnd == null) return null;

  const sinceMillis = nowMillis - lastEnd;
  if (sinceMillis <= RECENT_WINDOW_MILLIS) {
    const minutes = Math.floor(sinceMillis / 60_000);
    return minutes === 0 ? '방금 전까지 허용앱 사용' : `${minutes}분 전까지 허용앱 사용`;
  }
  return `오늘 허용앱 ${Math.round(totalUsageSeconds(intervals) / 60)}분`;
}
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

```bash
npx vitest run src/screens/shared/allowedAppUsageModel.test.ts
```

Expected: PASS, 11개.

- [ ] **Step 6: 커밋**

```bash
git add src/types/distraction.ts src/types/index.ts src/native/distractionStop.ts src/screens/shared/allowedAppUsageModel.ts src/screens/shared/allowedAppUsageModel.test.ts
git commit -m "feat: model allowed-app usage rows and the manager summary line"
```

---

### Task 4: 서버 왕복 — 상태, 로더, 전송 훅

**Files:**
- Modify: `src/types/db.ts`
- Modify: `src/state/mappers.ts`
- Modify: `src/state/AppStateContext.tsx`
- Create: `src/screens/student/useAllowedAppUsageFlush.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 3의 `toIntervalRows`, `AllowedAppInterval`, `NativeAllowedAppInterval`; `DistractionStop.clearAllowedAppIntervals()`; `useDistractionState()`; `isNativePlatform()`
- Produces:
  - `AppState.allowedAppIntervals: Record<string, AllowedAppInterval[]>` — 사용자 id로 키를 잡는다(학생은 자기 것, 매니저는 선택한 학생 것)
  - `actions.loadAllowedAppIntervals(userId: string): Promise<void>`
  - `actions.recordAllowedAppIntervals(rows: { user_id: string; started_at: string; ended_at: string }[]): Promise<void>`
  - `useAllowedAppUsageFlush(): void`

- [ ] **Step 1: DB 행 타입과 매퍼를 더한다**

`src/types/db.ts`에 추가한다.

```ts
export interface AllowedAppIntervalRow {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
}
```

`src/state/mappers.ts`에 추가한다.

```ts
export function allowedAppIntervalFromRow(row: AllowedAppIntervalRow): AllowedAppInterval {
  return { id: row.id, userId: row.user_id, startedAt: row.started_at, endedAt: row.ended_at };
}
```

import를 파일의 기존 방식에 맞춰 더한다.

- [ ] **Step 2: `AppStateContext`에 상태와 두 액션을 더한다**

상태 필드와 초기값을 더한다(`studySessions` 옆).

```ts
  allowedAppIntervals: Record<string, AllowedAppInterval[]>;
```

```ts
  allowedAppIntervals: {},
```

액션 시그니처를 인터페이스에 더한다.

```ts
  loadAllowedAppIntervals: (userId: string) => Promise<void>;
  recordAllowedAppIntervals: (rows: { user_id: string; started_at: string; ended_at: string }[]) => Promise<void>;
```

구현을 더한다. 오늘 구간만 불러온다 — 매니저 화면이 보여주는 것이 오늘치이고, 전부 불러올 이유가 없다.

```ts
      async loadAllowedAppIntervals(userId) {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
          .from('sb_allowed_app_intervals')
          .select('*')
          .eq('user_id', userId)
          .gte('started_at', dayStart.toISOString())
          .order('started_at');
        if (error) {
          console.error('loadAllowedAppIntervals failed:', error.message);
          return;
        }
        const intervals = (data ?? []).map(allowedAppIntervalFromRow);
        setState((s) => ({ ...s, allowedAppIntervals: { ...s.allowedAppIntervals, [userId]: intervals } }));
      },

      async recordAllowedAppIntervals(rows) {
        if (rows.length === 0) return;
        // (user_id, started_at) unique 인덱스 덕분에 같은 구간을 다시 보내도 행이 늘지 않는다.
        // 전송 성공 후 네이티브 목록 비우기가 실패하면 다음 실행이 또 보내기 때문에 필요하다.
        const { error } = await supabase
          .from('sb_allowed_app_intervals')
          .upsert(rows, { onConflict: 'user_id,started_at', ignoreDuplicates: true });
        if (error) {
          console.error('recordAllowedAppIntervals failed:', error.message);
          throw new Error(error.message);
        }
      },
```

`loadAllowedAppIntervals`는 실패해도 `state.error`를 세우지 않는다 — 부가 정보라 학생·매니저의 다른 작업을 막을 이유가 없다. `recordAllowedAppIntervals`는 훅이 재시도 여부를 판단해야 하므로 던진다.

로그인 직후 자기 것을 불러오도록 `loadAll` 끝에서 `void actions.loadAllowedAppIntervals(userId)`를 부르고, 매니저가 학생을 열 때는 `loadStudentPlannerItems` 끝에서 `void this.loadAllowedAppIntervals(studentId)`를 부른다.

- [ ] **Step 3: 전송 훅을 만든다**

`src/screens/student/useAllowedAppUsageFlush.ts`:

```ts
import React from 'react';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';
import { useAppState } from '../../state/AppStateContext';
import { toIntervalRows } from '../shared/allowedAppUsageModel';

// 네이티브가 쌓아둔 허용앱 사용 구간을 서버로 보내고 네이티브 목록을 비운다.
// StudentAppShell에서 부르기 때문에 딴짓멈춰 오버레이가 떠서 학생 홈이 언마운트돼도
// 계속 동작한다 — 학생이 허용앱에서 돌아오는 시점이 바로 그 오버레이를 지날 때다.
export function useAllowedAppUsageFlush(): void {
  const { state: distraction } = useDistractionState();
  const { state, actions } = useAppState();
  const intervals = distraction?.allowedAppIntervals ?? [];
  const count = intervals.length;
  const userId = state.profile?.id ?? null;
  const flushing = React.useRef(false);

  React.useEffect(() => {
    if (!isNativePlatform() || count === 0 || userId == null) return;
    if (flushing.current) return;
    flushing.current = true;

    const rows = toIntervalRows(intervals, userId);

    void (async () => {
      try {
        await actions.recordAllowedAppIntervals(rows);
        await DistractionStop.clearAllowedAppIntervals();
        await actions.loadAllowedAppIntervals(userId);
      } catch {
        // 전송에 실패하면 네이티브 목록이 그대로 남아 다음 기회에 다시 시도한다.
      } finally {
        flushing.current = false;
      }
    })();
    // intervals 자체를 의존성에 넣으면 매 렌더마다 새 배열이라 무한 반복이 된다.
  }, [count, userId, actions]);
}
```

`state.profile`은 `Profile | null`이므로 로그인 직후 잠깐 `null`이다. 훅은 그동안 아무 일도 하지 않고, 프로필이 채워지면 `userId`가 바뀌어 이펙트가 다시 돈다.

- [ ] **Step 4: 셸에서 훅을 부른다**

`src/App.tsx`의 `StudentAppShell` 본문에서 `usePendingStudyPause()` 바로 아래에 넣는다. 조기 반환보다 위여야 훅 순서가 안정적이다.

```tsx
  // 허용앱 사용 구간도 같은 이유로 셸에서 처리한다 — 오버레이가 떠도 계속 돌아야 한다.
  useAllowedAppUsageFlush();
```

import를 더한다.

```ts
import { useAllowedAppUsageFlush } from './screens/student/useAllowedAppUsageFlush';
```

- [ ] **Step 5: 세 관문을 통과시킨다**

```bash
npx tsc --noEmit
```

Expected: 출력 없음.

```bash
npx vitest run
```

Expected: 전부 PASS.

```bash
npx vite build
```

Expected: `built in ...`.

- [ ] **Step 6: 커밋**

```bash
git add src/types/db.ts src/state/mappers.ts src/state/AppStateContext.tsx src/screens/student/useAllowedAppUsageFlush.ts src/App.tsx
git commit -m "feat: flush allowed-app intervals to the server from the shell"
```

---

### Task 5: 매니저와 학생 화면에 드러내기

**Files:**
- Modify: `src/screens/manager/ManagerStudentList.tsx`
- Modify: `src/screens/shared/TimelineColumn.tsx`
- Modify: `src/screens/shared/ChecklistTimeline.tsx`
- Modify: `src/screens/manager/ManagerHome.tsx`
- Modify: `src/screens/student/StudentPlanner.tsx`

**Interfaces:**
- Consumes: Task 3의 `allowedAppSummary(intervals, nowMillis)`, `totalUsageSeconds(intervals)`; Task 4의 `state.allowedAppIntervals[userId]`
- Produces: `TimelineColumn`과 `ChecklistTimeline`이 `allowedAppMinutes?: { startMinutes: number; endMinutes: number }[]` prop을 받는다

- [ ] **Step 1: 학생 목록에 요약 줄을 더한다**

`ManagerStudentList.tsx`에서 기존 `summary` 계산 아래에 한 줄을 더한다.

```tsx
          const usageSummary = allowedAppSummary(state.allowedAppIntervals[s.id] ?? [], Date.now());
```

그리고 기존 `<p>` 아래에 조건부로 렌더한다.

```tsx
                  {usageSummary && <p className="text-xs mt-0.5 text-on-surface-variant">{usageSummary}</p>}
```

import를 더한다.

```ts
import { allowedAppSummary } from '../shared/allowedAppUsageModel';
```

**이 화면에 새 이펙트를 더하지 않는다.** `ManagerStudentList.tsx:13-16`의 기존 이펙트가 담당 학생 전원에 대해 `actions.loadStudentPlannerItems(s.id)`를 부르고, Task 4에서 그 로더가 끝에 `loadAllowedAppIntervals(studentId)`를 함께 부르게 만들었으므로 구간도 같이 채워진다.

- [ ] **Step 2: 타임라인 격자에 띠를 그린다**

`TimelineColumn.tsx`가 구간을 받아 겹치는 칸에 사선 무늬를 얹는다. 과목 색을 덮지 않고 위에 얹는 이유는, 그 시간이 어느 과목이었는지도 함께 읽혀야 하기 때문이다.

`TimelineColumn`의 props와 셀 렌더를 바꾼다.

```tsx
export interface AllowedAppSpan {
  startMinutes: number;
  endMinutes: number;
}

function isAllowedAppCell(spans: AllowedAppSpan[], cellStart: number, cellEnd: number): boolean {
  return spans.some((s) => s.startMinutes < cellEnd && s.endMinutes > cellStart);
}

export function TimelineColumn({
  segments,
  allowedAppSpans = [],
}: {
  segments: TimelineSegment[];
  allowedAppSpans?: AllowedAppSpan[];
}) {
```

셀 렌더를 바꾼다. 사선은 CSS 그라디언트로 얹어 새 색을 만들지 않는다.

```tsx
              const seg = cellSegment(segments, cellStart, cellEnd);
              const allowed = isAllowedAppCell(allowedAppSpans, cellStart, cellEnd);
              return (
                <div
                  key={c}
                  title={allowed ? `${seg?.subjectLabel ?? ''} · 허용앱`.trim() : seg?.subjectLabel}
                  className={seg ? undefined : 'bg-surface-container'}
                  style={
                    seg
                      ? {
                          backgroundColor: seg.color,
                          opacity: 0.8,
                          backgroundImage: allowed
                            ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0 2px, transparent 2px 4px)'
                            : undefined,
                        }
                      : undefined
                  }
                />
              );
```

- [ ] **Step 3: `ChecklistTimeline`이 구간을 받아 넘긴다**

props에 한 줄을 더한다.

```tsx
  allowedAppIntervals = [],
```

```tsx
  allowedAppIntervals?: AllowedAppInterval[];
```

`TimelineColumn`에 넘길 값을 만든다. `toMinutesOfDay`는 `src/lib.ts`에 이미 있다.

```tsx
  const allowedAppSpans = allowedAppIntervals.map((i) => ({
    startMinutes: toMinutesOfDay(i.startedAt),
    endMinutes: toMinutesOfDay(i.endedAt),
  }));
```

```tsx
      <TimelineColumn segments={segments} allowedAppSpans={allowedAppSpans} />
```

import를 더한다(`toMinutesOfDay`, `AllowedAppInterval` 타입).

- [ ] **Step 4: 매니저 홈과 학생 플래너가 구간을 넘긴다**

두 화면 모두 `ChecklistTimeline`을 쓰는 자리에 prop을 더한다. 매니저 홈은 선택된 학생 id로, 학생 플래너는 본인 id로 조회한다.

```tsx
        allowedAppIntervals={state.allowedAppIntervals[studentId] ?? []}
```

`ManagerHome.tsx`에는 학습 시간 합계가 아직 없으므로 만든다. `items`(오늘 항목)와 `state.studySessions`(항목 id로 키를 잡은 맵)가 이미 이 화면에 있다. `items` 선언 아래에 넣는다.

```tsx
  // 허용앱 시간과 나란히 놓아야 비율이 읽힌다. 아직 안 끝난 세션은 durationSeconds가 없으므로
  // 합계에서 빠진다 — 끝난 시간만 세는 쪽이 "지금까지 얼마나 했나"에 맞다.
  const totalStudySeconds = items.reduce(
    (sum, item) =>
      sum + (state.studySessions[item.id] ?? []).reduce((s2, sess) => s2 + (sess.durationSeconds ?? 0), 0),
    0
  );
  const allowedSeconds = totalUsageSeconds(state.allowedAppIntervals[studentId] ?? []);
```

그리고 `<h2>오늘 학습 타임라인</h2>` 바로 아래, `<ChecklistTimeline .../>` 위에 한 줄을 그린다.

```tsx
      <p className="text-xs text-on-surface-variant mb-2">
        {`학습 ${Math.round(totalStudySeconds / 60)}분 · 허용앱 ${Math.round(allowedSeconds / 60)}분`}
      </p>
```

import를 더한다.

```ts
import { totalUsageSeconds } from '../shared/allowedAppUsageModel';
```

- [ ] **Step 5: 세 관문을 통과시킨다**

```bash
npx tsc --noEmit
```

Expected: 출력 없음.

```bash
npx vitest run
```

Expected: 전부 PASS.

```bash
npx vite build
```

Expected: `built in ...`.

- [ ] **Step 6: 커밋**

```bash
git add src/screens/manager/ManagerStudentList.tsx src/screens/shared/TimelineColumn.tsx src/screens/shared/ChecklistTimeline.tsx src/screens/manager/ManagerHome.tsx src/screens/student/StudentPlanner.tsx
git commit -m "feat: show allowed-app usage in the student list and the timeline"
```

---

### Task 6: APK와 문서

**Files:**
- Modify: `docs/PRD.md`
- Modify: `dev/active/distraction-stop/distraction-stop-context.md`

실기기 검증(Step 3)은 실제 안드로이드 기기와 두 대의 폰이 필요하므로 사람이 수행한다. 구현자는 Step 1·2·4·5·6만 한다.

- [ ] **Step 1: 웹 자산을 빌드하고 동기화한다**

```bash
npx vite build && npx cap sync android
```

`cap sync`가 `android/` 아래 추적되는 생성 파일을 바꾸면 커밋하지 말고 어떤 파일이 바뀌었는지 보고한다.

- [ ] **Step 2: 디버그 APK를 빌드한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:assembleDebug --console=plain
```

산출물: `android/app/build/outputs/apk/debug/app-debug.apk`. 절대경로와 MB 단위 크기를 보고한다. 빌드가 실패하면 덮지 말고 `BLOCKED`으로 실제 gradle 오류를 보고한다.

- [ ] **Step 3: (사람이 수행) 실기기 검증**

구현자는 건너뛴다. 아래는 사람이 확인할 목록이다.

1. **먼저 Supabase에 마이그레이션 `0020`을 적용한다.** `0021`은 `supabase/deferred-migrations/`에 있으며, **모든 학생이** 이 APK를 설치한 뒤에 손으로 적용한다
2. 음악 앱을 허용앱으로 고르고 학습 타이머 시작
3. 음악 앱을 5분 열었다 앱으로 복귀 → 매니저 화면에 `방금 전까지 허용앱 사용`
4. 타임라인의 그 5분 칸에 사선 무늬가 보인다
5. 전화를 5분 받고 복귀 → **기록되지 않는다**(자동 통과 앱이라 허용앱이 아니다)
6. 쉬는 시간 중 음악 앱 사용 → 기록되지 않는다
7. 공부 중 음악 앱을 연 채로 앱을 강제 종료 → 다시 열고 다른 앱으로 나가면 그 구간이 닫혀 기록된다
8. 매니저 홈에 `학습 N분 · 허용앱 N분`이 보인다
9. 비행기 모드로 전송을 실패시킨 뒤 복구 → 구간이 중복 없이 한 번만 기록된다

- [ ] **Step 4: PRD에 절을 더한다**

`docs/PRD.md`의 `### 5.11 딴짓 멈춰 (안드로이드 전용)` 마지막 불릿 뒤에 아래를 더한다. 다른 절은 건드리지 않는다.

```markdown
- **허용앱을 얼마나 썼는지는 매니저에게 드러난다.** 공부 중 허용앱에 머문 시간 구간을 기록해 매니저 학생 목록에 `3분 전까지 허용앱 사용` / `오늘 허용앱 40분`으로, 오늘 타임라인에 사선 무늬로, 매니저 홈에 `학습 3시간 · 허용앱 40분`으로 보여준다. 한도를 두는 대신 드러내는 방식이다.
- **어떤 앱이었는지는 저장하지 않는다.** 매니저에게 필요한 신호는 "얼마나 오래"이지 "무엇을"이 아니다. 패키지명은 스키마에도 브리지에도 남지 않는다.
- 허용앱 사용 시간은 학습 시간에 **포함된다** — 학생이 허용한 앱이니 공부의 일부로 보되, 비율이 보이게 한다.
- 이 값은 실시간이 아니다. 학생이 허용앱을 쓰는 동안 앱은 백그라운드라 서버 값이 그만큼 늦으므로, 문구를 `N분 전까지`로 써서 그 지연을 드러낸다.
```

- [ ] **Step 5: dev docs를 갱신한다**

`dev/active/distraction-stop/distraction-stop-context.md`의 `**Last Updated**`를 `2026-08-28`로 바꾸고 `## 의사결정 로그` 맨 아래에 더한다.

```markdown
- **허용앱 사용 노출(2026-08-28)**: 공부 중 허용앱에 머문 구간을 `sb_allowed_app_intervals`에 기록해 매니저에게 보여준다. **패키지명은 저장하지 않는다** — 필요한 신호는 "얼마나 오래"이고, 저장하지 않으면 새어 나갈 것도 없다. 감지는 접근성 서비스가 `TimerState`에 구간을 쌓고 셸 레벨 훅이 서버로 비우는 방식(`pendingPauseAtMillis`와 같은 패턴). Supabase Realtime은 도입하지 않았다 — 학생이 허용앱을 쓰는 동안 앱이 백그라운드라 쓰기 자체가 늦고, 늦은 값을 실시간처럼 보이면 매니저가 잘못 믿는다. 대신 문구가 `N분 전까지`로 지연을 드러낸다. 죽어 있던 `sb_study_sessions.deviated`도 함께 삭제(마이그레이션 `0021`은 `supabase/deferred-migrations/`에 보류 — 모든 학생이 새 APK를 설치한 뒤 손으로 적용). 스펙: `docs/superpowers/specs/2026-08-28-allowed-app-usage-visibility-design.md`
```

- [ ] **Step 6: 커밋**

```bash
git add docs/PRD.md dev/active/distraction-stop/distraction-stop-context.md
git commit -m "docs: record allowed-app usage visibility in the PRD and dev context"
```
