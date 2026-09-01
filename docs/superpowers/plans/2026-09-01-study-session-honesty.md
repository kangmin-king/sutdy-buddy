# 학습 세션 기록 정직성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생이 멈춤을 누르지 않은 학습 세션이 매니저의 기록을 부풀리거나 지우는 것을 막는다.

**Architecture:** 규칙은 하나 — 한 세션은 3시간을 넘게 기여할 수 없다. 그 규칙을 순수 함수에 담고 화면 표시와 자동 마감이 같은 함수를 쓴다. 만료된 세션 탐색은 항목 가시성으로 거르지 않는다(자정 문제의 실제 수정). 마감 쓰기는 학생 셸의 훅이 세 개의 명시적 트리거에서만 발사한다.

**Tech Stack:** React + TypeScript, Vitest, Supabase(Postgres), Capacitor.

**Spec:** `docs/superpowers/specs/2026-09-01-study-session-honesty-design.md`

## Global Constraints

- UI 문구는 한국어, 코드·커밋 메시지는 영어. **수정하는 파일의 주변 주석 언어를 따른다** — 이 저장소의 주석은 한국어가 많다.
- 상한 값은 `SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000` (`src/screens/distractionStopModel.ts:30`). 새 상수를 만들지 말고 이것을 import한다. 네이티브 `TimerState.SESSION_MAX_MILLIS`와 같은 값이어야 한다.
- **불변성**: 객체를 제자리에서 바꾸지 않는다. 새 객체를 만들어 반환한다.
- **순수 함수에 로직을 몬다.** 훅과 액션은 얇게. 이 프로젝트의 웹 테스트는 Vitest 단위 테스트뿐이고 컴포넌트 렌더 테스트 하니스가 없다 — 순수 함수 밖에 있는 로직은 사실상 테스트되지 않는다.
- **놀고 있는 `deviated` 컬럼을 재활용하지 않는다.** 보류 중인 `supabase/deferred-migrations/0021_drop_study_session_deviated.sql`이 그 컬럼을 drop한다.
- 자동 마감 쓰기에는 반드시 `.is('ended_at', null)` 조건을 건다. 학생이 직접 누른 멈춤이 자동 마감을 이겨야 한다.
- 쓰기를 1초 렌더 틱에서 발사하지 않는다.
- **기준선: 웹 단위 테스트 149개(6개 파일) 통과.** 이 변경으로 줄지 않아야 한다 — 예외는 Task 1이 `secondsUntil` 테스트를 지우는 것 하나뿐이고, 그 자리는 새 `cappedSessionSeconds` 테스트가 같은 경계를 더 넓게 덮는다. 최종 합계는 149보다 커야 한다.
- 게이트: `npx tsc --noEmit && npm test -- --run`. 둘 다 통과해야 커밋한다. **이 저장소에는 `lint` 스크립트가 없다** — package.json의 스크립트는 dev/build/preview/test/android:sync/ios:sync뿐이다.

---

### Task 1: 상한 규칙과 만료 세션 탐색 (순수 함수)

**Files:**
- Create: `src/screens/student/studySessionModel.ts`
- Create: `src/screens/student/studySessionModel.test.ts`
- Modify: `src/screens/student/pendingPauseModel.ts` (`secondsUntil`·`MAX_SESSION_SECONDS` 삭제)
- Modify: `src/screens/student/pendingPauseModel.test.ts` (`secondsUntil` 테스트를 새 파일로 이동)
- Modify: `src/screens/student/usePendingStudyPause.ts` (import 이름 변경)

**Interfaces:**
- Consumes: `SESSION_MAX_MILLIS` from `../distractionStopModel`; `StudySession` from `../../types`
- Produces: `MAX_SESSION_SECONDS`, `cappedSessionSeconds(startedAt, atMillis)`, `ExpiredOpenSession`, `findExpiredOpenSessions(studySessions, nowMillis)`

`StudySession`은 `{ id, plannerItemId, startedAt, endedAt, durationSeconds }`이다 (`src/types/index.ts:175`).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/screens/student/studySessionModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { StudySession } from '../../types';
import { SESSION_MAX_MILLIS } from '../distractionStopModel';
import { cappedSessionSeconds, findExpiredOpenSessions, MAX_SESSION_SECONDS } from './studySessionModel';

const T0 = Date.parse('2026-09-01T09:00:00.000Z');

// 캐스트를 쓰지 않는다. Task 2가 StudySession에 autoClosed를 필수로 더할 때, 캐스트가
// 있으면 tsc가 이 헬퍼를 짚어주지 못하고 필드가 빠진 객체가 조용히 남는다.
function session(overrides: Partial<StudySession> & { id: string; startedAt: string }): StudySession {
  return {
    plannerItemId: 'item-1',
    endedAt: null,
    durationSeconds: null,
    ...overrides,
  };
}

describe('cappedSessionSeconds', () => {
  it('counts the seconds actually elapsed below the cap', () => {
    expect(cappedSessionSeconds(new Date(T0).toISOString(), T0 + 90_000)).toBe(90);
  });

  it('caps at three hours', () => {
    expect(cappedSessionSeconds(new Date(T0).toISOString(), T0 + SESSION_MAX_MILLIS * 5)).toBe(MAX_SESSION_SECONDS);
  });

  it('returns exactly the cap at the boundary', () => {
    expect(cappedSessionSeconds(new Date(T0).toISOString(), T0 + SESSION_MAX_MILLIS)).toBe(MAX_SESSION_SECONDS);
  });

  it('never goes negative when the device clock jumps backwards', () => {
    expect(cappedSessionSeconds(new Date(T0).toISOString(), T0 - 60_000)).toBe(0);
  });

  it('returns 0 for an unparsable timestamp rather than NaN', () => {
    expect(cappedSessionSeconds('not-a-date', T0)).toBe(0);
  });
});

describe('findExpiredOpenSessions', () => {
  it('finds an open session whose planner item is not in today list', () => {
    // 결함 2의 회귀 테스트. deriveRunningSessionIds/findStaleRunningSessions는 오늘 항목만
    // 보기 때문에 어제 열린 세션을 영영 닫지 않는다. 이 함수는 항목 가시성을 보지 않는다.
    const yesterday = new Date(T0 - 20 * 60 * 60 * 1000).toISOString();
    const found = findExpiredOpenSessions({ 'item-from-yesterday': [session({ id: 's1', startedAt: yesterday })] }, T0);
    expect(found).toEqual([
      {
        itemId: 'item-from-yesterday',
        sessionId: 's1',
        endedAt: new Date(Date.parse(yesterday) + SESSION_MAX_MILLIS).toISOString(),
        durationSeconds: MAX_SESSION_SECONDS,
      },
    ]);
  });

  it('does not return a session that is still within three hours', () => {
    const startedAt = new Date(T0 - SESSION_MAX_MILLIS + 1).toISOString();
    expect(findExpiredOpenSessions({ 'item-1': [session({ id: 's1', startedAt })] }, T0)).toEqual([]);
  });

  it('returns a session at exactly three hours', () => {
    const startedAt = new Date(T0 - SESSION_MAX_MILLIS).toISOString();
    expect(findExpiredOpenSessions({ 'item-1': [session({ id: 's1', startedAt })] }, T0)).toHaveLength(1);
  });

  it('ignores sessions that are already closed', () => {
    const startedAt = new Date(T0 - SESSION_MAX_MILLIS * 2).toISOString();
    const closed = session({ id: 's1', startedAt, endedAt: new Date(T0).toISOString(), durationSeconds: 120 });
    expect(findExpiredOpenSessions({ 'item-1': [closed] }, T0)).toEqual([]);
  });

  it('returns every expired session across items', () => {
    const old = new Date(T0 - SESSION_MAX_MILLIS * 2).toISOString();
    const found = findExpiredOpenSessions(
      { 'item-1': [session({ id: 's1', startedAt: old })], 'item-2': [session({ id: 's2', startedAt: old })] },
      T0,
    );
    expect(found.map((f) => f.sessionId).sort()).toEqual(['s1', 's2']);
  });

  it('skips a session whose startedAt cannot be parsed', () => {
    expect(findExpiredOpenSessions({ 'item-1': [session({ id: 's1', startedAt: 'nope' })] }, T0)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트를 돌려서 실패를 확인한다**

Run: `npx vitest run src/screens/student/studySessionModel.test.ts`
Expected: FAIL — `Failed to resolve import "./studySessionModel"`

- [ ] **Step 3: 최소 구현을 쓴다**

`src/screens/student/studySessionModel.ts`:

```ts
import type { StudySession } from '../../types';
import { SESSION_MAX_MILLIS } from '../distractionStopModel';

// 한 학습 세션이 기여할 수 있는 최대 시간. 딴짓 멈춰의 세션 자동 만료와 같은 값이라
// 학생이 겪는 규칙이 하나로 유지된다.
export const MAX_SESSION_SECONDS = SESSION_MAX_MILLIS / 1000;

// 화면의 실시간 경과와 자동 마감이 둘 다 이 함수를 쓴다. 각자 계산하면 언젠가 어긋나고,
// 어긋나면 학생이 본 숫자와 저장되는 숫자가 달라진다.
export function cappedSessionSeconds(startedAt: string, atMillis: number): number {
  const startedAtMillis = Date.parse(startedAt);
  if (Number.isNaN(startedAtMillis)) return 0;
  const seconds = Math.floor((atMillis - startedAtMillis) / 1000);
  return Math.min(MAX_SESSION_SECONDS, Math.max(0, seconds));
}

export interface ExpiredOpenSession {
  itemId: string;
  sessionId: string;
  endedAt: string;
  durationSeconds: number;
}

// 3시간이 지나도록 닫히지 않은 세션을 전부 찾는다.
//
// 요점은 **플래너 항목의 가시성으로 거르지 않는다**는 것이다. deriveRunningSessionIds와
// findStaleRunningSessions는 오늘 미완료 항목만 보기 때문에, 자정을 넘겨 남은 세션은
// 어느 쪽 대상도 되지 못하고 ended_at/duration_seconds가 null인 채로 영영 남는다.
// 그런 행은 매니저 화면에서 통째로 사라진다(합계는 ?? 0, 타임라인은 건너뜀).
export function findExpiredOpenSessions(
  studySessions: Readonly<Record<string, readonly StudySession[]>>,
  nowMillis: number,
): ExpiredOpenSession[] {
  const expired: ExpiredOpenSession[] = [];
  for (const [itemId, sessions] of Object.entries(studySessions)) {
    for (const session of sessions) {
      if (session.endedAt != null) continue;
      const startedAtMillis = Date.parse(session.startedAt);
      // 못 읽는 값에 마감을 써넣는 것보다 남겨두는 편이 안전하다.
      if (Number.isNaN(startedAtMillis)) continue;
      const expiresAtMillis = startedAtMillis + SESSION_MAX_MILLIS;
      if (expiresAtMillis > nowMillis) continue;
      expired.push({
        itemId,
        sessionId: session.id,
        endedAt: new Date(expiresAtMillis).toISOString(),
        durationSeconds: MAX_SESSION_SECONDS,
      });
    }
  }
  return expired;
}
```

- [ ] **Step 4: 테스트를 돌려서 통과를 확인한다**

Run: `npx vitest run src/screens/student/studySessionModel.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: `secondsUntil`을 새 이름으로 옮긴다**

`src/screens/student/pendingPauseModel.ts`에서 아래 블록을 **삭제한다**:

```ts
// 표식 시각까지 실제로 공부한 초. 지금 시각이 아니라 표식 시각을 쓰는 것이 요점이다 —
// 웹이 늦게 알아차린 지연이 학습 시간에 더해지면 쉬는 시간이 공부 시간으로 들어간다.
// 위쪽은 네이티브 세션 자동 만료(3시간)로 자른다: 정직한 한 세션이 그보다 길 수 없고,
// 기기 시계가 앞으로 튄 경우에도 말이 안 되는 값이 저장되지 않는다.
const MAX_SESSION_SECONDS = SESSION_MAX_MILLIS / 1000;

export function secondsUntil(startedAt: string, atMillis: number): number {
  const seconds = Math.floor((atMillis - Date.parse(startedAt)) / 1000);
  return Math.min(MAX_SESSION_SECONDS, Math.max(0, seconds));
}
```

파일 상단의 `SESSION_MAX_MILLIS` import는 `findOpenStudySessionsBefore`가 아직 쓰므로 **남긴다.**

`src/screens/student/usePendingStudyPause.ts`:

```ts
import { findOpenStudySessionsBefore } from './pendingPauseModel';
import { cappedSessionSeconds } from './studySessionModel';
```

그리고 호출부를 바꾼다:

```ts
await actions.endStudySession(itemId, sessionId, cappedSessionSeconds(startedAt, pendingAt));
```

`src/screens/student/pendingPauseModel.test.ts`에서 `secondsUntil`을 부르는 테스트들을 삭제한다. 그 테스트가 지키던 경계(3시간 상한, 음수 방지)는 Step 1의 `cappedSessionSeconds` 테스트가 이미 같은 값으로 덮고 있으므로 새로 옮겨 쓸 필요는 없다 — 다만 삭제 후 남은 import가 없는지 확인한다.

- [ ] **Step 6: 게이트를 돌린다**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: 전부 통과. 테스트 수는 `secondsUntil` 테스트가 빠진 만큼 줄고 새 파일의 11개가 늘어 **순증**이어야 한다.

- [ ] **Step 7: 커밋**

```bash
git add src/screens/student/studySessionModel.ts src/screens/student/studySessionModel.test.ts src/screens/student/pendingPauseModel.ts src/screens/student/pendingPauseModel.test.ts src/screens/student/usePendingStudyPause.ts
git commit -m "feat: add the study session cap and expired-session scan"
```

---

### Task 2: 스키마·타입·액션 — `auto_closed`와 결함 3

**Files:**
- Create: `supabase/migrations/0022_study_session_auto_closed.sql`
- Modify: `src/types/db.ts` (`SbStudySessionRow`)
- Modify: `src/types/index.ts` (`StudySession`)
- Modify: `src/state/mappers.ts` (`studySessionFromRow`)
- Modify: `src/state/AppStateContext.tsx` (`autoCloseStudySession` 추가, `endStudySession` 수정)

**Interfaces:**
- Consumes: Task 1의 `ExpiredOpenSession` 모양 (`itemId`, `sessionId`, `endedAt`, `durationSeconds`)
- Produces: `StudySession.autoClosed: boolean`; `actions.autoCloseStudySession(itemId, sessionId, endedAt, durationSeconds): Promise<void>`

- [ ] **Step 1: 마이그레이션을 쓴다**

`supabase/migrations/0022_study_session_auto_closed.sql`:

```sql
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
```

`if not exists`를 쓰는 이유: 이 저장소의 마이그레이션은 사람이 Supabase SQL 편집기에서 손으로 돌리므로 두 번 실행될 수 있다. 두 번째 실행에서 `alter table`이 죽으면 뒤의 `update`가 돌지 않는다.

**적용 순서:** `0020_allowed_app_intervals.sql`이 아직 적용되지 않았다. 0020을 먼저 돌리고 그다음 0022다. `supabase/deferred-migrations/0021_...`은 번호 순서 밖에 따로 있고 모든 학생이 이 브랜치 APK를 설치하기 전까지 보류다 — **여기서 건드리지 않는다.**

- [ ] **Step 2: 타입과 매퍼를 넓힌다**

`src/types/db.ts` — `SbStudySessionRow`에 추가:

```ts
export type SbStudySessionRow = {
  id: string;
  user_id: string;
  planner_item_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  auto_closed: boolean;
};
```

`src/types/index.ts` — `StudySession`에 추가:

```ts
export interface StudySession {
  id: string;
  plannerItemId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  autoClosed: boolean;
}
```

`src/state/mappers.ts`:

```ts
export function studySessionFromRow(row: SbStudySessionRow): StudySession {
  return {
    id: row.id,
    plannerItemId: row.planner_item_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    // 마이그레이션 0022 이전에 저장된 행은 이 컬럼이 없을 수 있다(로컬 캐시·구버전 응답).
    // 없으면 "학생이 직접 닫았다"로 읽는 편이 안전하다 — 있지도 않은 자동 마감 표시를
    // 매니저에게 보여주지 않는다.
    autoClosed: row.auto_closed ?? false,
  };
}
```

`autoClosed`가 필수 필드가 되면 `StudySession` 객체 리터럴을 만드는 모든 자리가 컴파일 에러를 낸다. `npx tsc --noEmit`이 그 자리를 전부 짚어주므로, 각 자리에 `autoClosed: false`를 넣는다(새로 시작하는 세션은 자동 마감이 아니다). **테스트 파일의 헬퍼도 포함된다** — 기존 테스트가 깨지면 헬퍼에 기본값을 넣어 고치고, 테스트의 의도는 바꾸지 않는다.

- [ ] **Step 3: `autoCloseStudySession` 액션을 더한다**

`src/state/AppStateContext.tsx`의 액션 타입 선언에 추가(`endStudySession` 바로 아래):

```ts
  autoCloseStudySession: (
    itemId: string,
    sessionId: string,
    endedAt: string,
    durationSeconds: number
  ) => Promise<void>;
```

구현 (`endStudySession` 구현 바로 아래에 둔다):

```ts
      // 학생이 멈춤을 누르지 않아 3시간이 지난 세션을 닫는다. endStudySession을 재사용하지
      // 않는 이유는 그쪽이 endedAt을 항상 "지금"으로 잡기 때문이다 — 자동 마감은
      // startedAt + 3시간이라는 과거 시각을 써야 한다.
      async autoCloseStudySession(itemId, sessionId, endedAt, durationSeconds) {
        setState((s) => {
          const list = s.studySessions[itemId] ?? [];
          const updated = list.map((sess) =>
            sess.id === sessionId ? { ...sess, endedAt, durationSeconds, autoClosed: true } : sess
          );
          return { ...s, studySessions: { ...s.studySessions, [itemId]: updated } };
        });

        // .is('ended_at', null)이 핵심이다. 스캔과 이 쓰기 사이에 학생이 직접 멈춤을 눌렀다면
        // 그 정직한 값이 남아야 한다. 조건이 없으면 자동 마감이 실제 기록을 이긴다.
        const { error } = await supabase
          .from('sb_study_sessions')
          .update({ ended_at: endedAt, duration_seconds: durationSeconds, auto_closed: true })
          .eq('id', sessionId)
          .is('ended_at', null);
        if (error) {
          console.error('autoCloseStudySession failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },
```

- [ ] **Step 4: 결함 3을 고친다**

`src/state/AppStateContext.tsx`의 `endStudySession`에서 `existing`이 없을 때 `duration_seconds`에 null을 쓰지 않게 한다. 현재:

```ts
        const durationSeconds = existing
          ? (displayedSeconds ?? Math.floor((Date.parse(endedAt) - Date.parse(existing.startedAt)) / 1000))
          : null;
```

로컬 상태 갱신은 그대로 두고(`durationSeconds`가 null이면 기존 값을 유지하도록), 서버 update 페이로드를 조건부로 만든다:

```ts
        // existing을 못 찾으면 duration을 계산할 근거가 없다. 그렇다고 null을 써넣으면
        // ended_at은 있는데 duration_seconds가 없는 행이 되어, 매니저 화면에서 그 시간이
        // 통째로 사라진다(합계는 ?? 0, 타임라인은 건너뜀). 모르면 건드리지 않는다.
        const patch: { ended_at: string; duration_seconds?: number } =
          durationSeconds == null ? { ended_at: endedAt } : { ended_at: endedAt, duration_seconds: durationSeconds };

        const { error } = await supabase
          .from('sb_study_sessions')
          .update(patch)
          .eq('id', sessionId);
```

로컬 `setState`도 `durationSeconds`가 null이면 기존 값을 덮지 않게 한다:

```ts
          const updated = list.map((sess) =>
            sess.id === sessionId
              ? { ...sess, endedAt, durationSeconds: durationSeconds ?? sess.durationSeconds }
              : sess
          );
```

- [ ] **Step 5: 게이트를 돌린다**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: 전부 통과. `autoClosed` 필수화로 깨진 자리를 전부 고친 뒤여야 한다.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0022_study_session_auto_closed.sql src/types/db.ts src/types/index.ts src/state/mappers.ts src/state/AppStateContext.tsx
git commit -m "feat: mark auto-closed study sessions and stop erasing durations"
```

---

### Task 3: 닫힌 세션이 화면을 막지 않게 하기 (순수 함수)

**Files:**
- Modify: `src/screens/student/studentHomeModel.ts` (`filterOpenRunningSessions` 추가, 경과에 상한 적용)
- Modify: `src/screens/student/studentHomeModel.test.ts`
- Modify: `src/screens/student/StudentHome.tsx`

**Interfaces:**
- Consumes: Task 1의 `cappedSessionSeconds`
- Produces: `filterOpenRunningSessions(runningSessionIds, studySessions): Record<string, string>`

**왜 필요한가:** `runningSessionId`는 `StudentHome`의 화면 상태다. 셸의 훅(Task 4)이 세션을 닫아도 그 항목은 키로 남는다. `canStartStudyItem`은 **키 개수만** 보므로(`Object.keys(...).length`), 닫힌 세션이 남아 있는 동안 학생은 다른 항목을 시작할 수 없다. 지금도 `usePendingStudyPause`가 같은 상황을 만들지만(`StudentHome.tsx`의 `handleStop` 주석이 그 사실을 기록하고 있다), 자동 마감이 들어오면 훨씬 자주 벌어진다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/screens/student/studentHomeModel.test.ts`에 추가한다. 이 파일에는 이미 헬퍼 둘이 있으므로 **그대로 쓴다**:

```ts
function item(id: string, order: number, status: PlannerItem['status'] = 'planned'): PlannerItem
function session(id: string, plannerItemId: string, overrides: Partial<StudySession> = {}): StudySession
```

`session`의 기본값은 `startedAt: '2026-08-21T09:00:00.000Z'`, `endedAt: '2026-08-21T09:10:00.000Z'`, `durationSeconds: 600`(=닫힌 세션)이다. 열린 세션은 `{ endedAt: null, durationSeconds: null }`을 넘겨서 만든다.

파일 상단 import에 `filterOpenRunningSessions`를 더하고, `SESSION_MAX_MILLIS`/`MAX_SESSION_SECONDS`도 가져온다:

```ts
import { SESSION_MAX_MILLIS } from '../distractionStopModel';
import { MAX_SESSION_SECONDS } from './studySessionModel';
```

추가할 테스트:

```ts
describe('filterOpenRunningSessions', () => {
  it('keeps an entry whose session is still open', () => {
    const sessions = { 'item-1': [session('s1', 'item-1', { endedAt: null, durationSeconds: null })] };
    expect(filterOpenRunningSessions({ 'item-1': 's1' }, sessions)).toEqual({ 'item-1': 's1' });
  });

  it('drops an entry whose session was closed elsewhere', () => {
    // 셸의 자동 마감이나 쉬는 시간 처리가 닫은 경우. 남겨두면 canStartStudyItem이
    // 키 개수만 보기 때문에 학생이 다른 항목을 시작할 수 없다.
    expect(filterOpenRunningSessions({ 'item-1': 's1' }, { 'item-1': [session('s1', 'item-1')] })).toEqual({});
  });

  it('drops an entry whose session is not in state at all', () => {
    expect(filterOpenRunningSessions({ 'item-1': 's-missing' }, {})).toEqual({});
  });
});

describe('buildStudentHomeModel elapsed cap', () => {
  it('caps the live elapsed time of a forgotten session at three hours', () => {
    const startedAt = '2026-08-21T09:00:00.000Z';
    const nowMs = Date.parse(startedAt) + SESSION_MAX_MILLIS * 4;
    const model = buildStudentHomeModel(
      [item('item-1', 1)],
      { 'item-1': [session('s1', 'item-1', { startedAt, endedAt: null, durationSeconds: null })] },
      { 'item-1': 's1' },
      nowMs,
    );
    expect(model.elapsedSecondsByItemId['item-1']).toBe(MAX_SESSION_SECONDS);
  });
});
```

- [ ] **Step 2: 테스트를 돌려서 실패를 확인한다**

Run: `npx vitest run src/screens/student/studentHomeModel.test.ts`
Expected: FAIL — `filterOpenRunningSessions` is not exported, 그리고 상한 테스트는 3시간이 아닌 큰 값을 반환한다

- [ ] **Step 3: 구현한다**

`src/screens/student/studentHomeModel.ts` 상단 import에 추가:

```ts
import { cappedSessionSeconds } from './studySessionModel';
```

`buildStudentHomeModel` 안의 실시간 경과 계산을 바꾼다:

```ts
      if (runningSession && runningSession.endedAt == null) {
        // 상한이 없으면 멈춤을 안 누른 세션이 "12:00:00 학습"으로 표시된다. 자동 마감이
        // 쓰는 값과 같은 함수를 써서 화면과 저장값이 어긋날 수 없게 한다.
        elapsedSeconds += cappedSessionSeconds(runningSession.startedAt, nowMs);
      }
```

파일 끝에 함수를 더한다:

```ts
// 화면의 runningSessionIds에서 이미 닫힌 세션을 걸러낸다.
//
// runningSessionIds는 StudentHome의 화면 상태라, 세션을 닫은 주체가 화면 밖이면(쉬는 시간
// 처리, 자동 마감) 항목이 키로 남는다. canStartStudyItem은 키 개수만 보므로 그 상태에서는
// 학생이 다른 항목을 시작할 수 없다. 어디서 닫혔든 화면이 스스로 회복하게 한다.
export function filterOpenRunningSessions(
  runningSessionIds: Readonly<Record<string, string>>,
  studySessions: Readonly<Record<string, readonly StudySession[]>>,
): Record<string, string> {
  const open: Record<string, string> = {};
  for (const [itemId, sessionId] of Object.entries(runningSessionIds)) {
    const session = (studySessions[itemId] ?? []).find((s) => s.id === sessionId);
    if (session && session.endedAt == null) open[itemId] = sessionId;
  }
  return open;
}
```

- [ ] **Step 4: 테스트를 돌려서 통과를 확인한다**

Run: `npx vitest run src/screens/student/studentHomeModel.test.ts`
Expected: PASS

- [ ] **Step 5: `StudentHome`이 걸러진 값을 쓰게 한다**

`src/screens/student/StudentHome.tsx`에서 import를 넓히고, `homeModel` 계산 **직전에** 파생값을 만든다:

```ts
  // 셸의 자동 마감이나 쉬는 시간 처리가 세션을 닫으면 runningSessionId에는 항목이 그대로
  // 남는다. 아래 모든 판단은 "정말 열려 있는" 것만 봐야 한다.
  const openRunningSessionId = React.useMemo(
    () => filterOpenRunningSessions(runningSessionId, state.studySessions),
    [runningSessionId, state.studySessions],
  );
```

그리고 `runningSessionId`를 읽던 **표시·판단 자리**를 `openRunningSessionId`로 바꾼다:

- `buildStudentHomeModel(...)`의 세 번째 인자
- `canStartStudyItem(...)` 호출 두 군데
- `currentIsRunning` 계산
- 목록 항목의 `const isRunning = Boolean(...)`

`handleStop`의 `const sessionId = runningSessionId[itemId]`는 **바꾸지 않는다.** 그 함수는 이미 닫힌 세션을 만났을 때의 처리를 따로 갖고 있고(주석 참조), 여기서 바꾸면 그 처리 경로가 죽는다.

`setRunningSessionId`를 부르는 자리도 그대로 둔다 — 원본은 계속 원본대로 두고 파생값만 화면이 쓴다.

- [ ] **Step 6: 게이트를 돌린다**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: 전부 통과

- [ ] **Step 7: 커밋**

```bash
git add src/screens/student/studentHomeModel.ts src/screens/student/studentHomeModel.test.ts src/screens/student/StudentHome.tsx
git commit -m "fix: cap displayed elapsed time and ignore closed running sessions"
```

---

### Task 4: 마감을 발사하는 훅

**Files:**
- Create: `src/screens/student/useExpiredSessionClose.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 1의 `findExpiredOpenSessions`; Task 2의 `actions.autoCloseStudySession`
- Produces: `useExpiredSessionClose(): void`

**참고할 기존 패턴:** `src/screens/student/useAllowedAppUsageFlush.ts`. 그 파일의 긴 주석은 실제로 겪은 재진입 버그를 기록한 것이다 — `actions`는 `useMemo(..., [userId, state])`라 AppState가 바뀔 때마다 새 객체가 되고, 이 훅이 부르는 액션이 바로 그 AppState를 바꾼다. `actions`를 의존성에 두면 무한 반복이 된다. **같은 함정이 이 훅에도 그대로 있다.**

- [ ] **Step 1: 훅을 쓴다**

`src/screens/student/useExpiredSessionClose.ts`:

```ts
import React from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { isNativePlatform } from '../../native/distractionStop';
import { useAppState } from '../../state/AppStateContext';
import { findExpiredOpenSessions } from './studySessionModel';

// 학생이 멈춤을 누르지 않아 3시간이 지난 학습 세션을 닫는다. StudentAppShell에서 부르기
// 때문에 딴짓멈춰 오버레이가 떠서 학생 홈이 언마운트돼도 계속 동작한다.
//
// 트리거는 셋이다: 마운트(앱을 켰을 때 밀린 것 정리), 앱 복귀(학생이 돌아오는 순간),
// 그리고 앱을 열어둔 채 3시간을 넘기는 경우. 마지막 것을 위해 새 타이머를 만들지 않고
// 분 단위 시각을 상태로 들고 1분에 한 번만 스캔한다 — 1초 렌더 틱에 쓰기를 걸면
// 재진입이 생긴다.
export function useExpiredSessionClose(): void {
  const { state, actions } = useAppState();
  const [minuteTick, setMinuteTick] = React.useState(() => Math.floor(Date.now() / 60_000));
  const closing = React.useRef(false);
  const sentSessionIds = React.useRef<Set<string>>(new Set());

  // useAllowedAppUsageFlush와 같은 이유로 actions와 studySessions를 ref로 든다: 이 훅이
  // 부르는 액션이 AppState를 바꾸고, AppState가 바뀌면 actions가 새 객체가 된다. 둘을
  // 의존성에 두면 이펙트가 자기 자신의 갱신에 다시 걸린다.
  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;
  const studySessionsRef = React.useRef(state.studySessions);
  studySessionsRef.current = state.studySessions;

  React.useEffect(() => {
    const id = setInterval(() => setMinuteTick(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(id);
  }, []);

  // 앱 복귀. 학생이 돌아오는 바로 그 순간에 한 번 더 돌리기 위해 분 tick을 앞당긴다.
  React.useEffect(() => {
    if (!isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener('resume', () =>
      setMinuteTick(Math.floor(Date.now() / 60_000)),
    );
    return () => {
      void listenerPromise.then((handle) => handle.remove());
    };
  }, []);

  React.useEffect(() => {
    if (state.loading) return;
    if (closing.current) return;

    const expired = findExpiredOpenSessions(studySessionsRef.current, Date.now()).filter(
      (session) => !sentSessionIds.current.has(session.sessionId),
    );
    if (expired.length === 0) return;

    closing.current = true;
    for (const session of expired) sentSessionIds.current.add(session.sessionId);

    void (async () => {
      try {
        for (const { itemId, sessionId, endedAt, durationSeconds } of expired) {
          await actionsRef.current.autoCloseStudySession(itemId, sessionId, endedAt, durationSeconds);
        }
      } finally {
        closing.current = false;
      }
    })();
  }, [minuteTick, state.loading]);
}
```

`state.loading`을 의존성에 두는 이유: 첫 로드가 끝나기 전에는 `studySessions`가 비어 있어서 스캔이 아무것도 못 찾는다. 로드가 끝나는 순간 한 번 돌아야 한다.

- [ ] **Step 2: 학생 셸에 연결한다**

`src/App.tsx`의 import에 추가:

```ts
import { useExpiredSessionClose } from './screens/student/useExpiredSessionClose';
```

`useAllowedAppUsageFlush();` 바로 아래에 추가:

```ts
  // 멈춤을 누르지 않아 3시간이 지난 학습 세션을 닫는다. 같은 이유로 셸에서 부른다 —
  // 오버레이가 떠 있는 동안에도 돌아야 하고, 학생 홈의 마운트 여부와 무관해야 한다.
  useExpiredSessionClose();
```

- [ ] **Step 3: 게이트를 돌린다**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: 전부 통과. 이 태스크는 훅이라 새 단위 테스트가 없다 — 로직은 Task 1의 순수 함수에 있고 여기 남은 것은 배선뿐이다.

- [ ] **Step 4: 커밋**

```bash
git add src/screens/student/useExpiredSessionClose.ts src/App.tsx
git commit -m "feat: close expired study sessions from the student shell"
```

---

### Task 5: 매니저 화면에 자동 마감 표시

**Files:**
- Modify: `src/screens/shared/TimelineColumn.tsx` (`TimelineSegment`에 `autoClosed`)
- Modify: `src/screens/shared/ChecklistTimeline.tsx`

**Interfaces:**
- Consumes: Task 2의 `StudySession.autoClosed`
- Produces: 없음 (표시 계층)

**빗금을 쓸 수 없다.** 45° 빗금(`repeating-linear-gradient`)은 이미 허용앱 칸이 쓰고 있다(`TimelineColumn.tsx`). 자동 마감에도 빗금을 쓰면 둘을 구분할 수 없다. 채도를 낮추는 쪽으로 간다.

- [ ] **Step 1: 세그먼트에 표식을 단다**

`src/screens/shared/TimelineColumn.tsx`:

```ts
export interface TimelineSegment {
  subjectLabel: string;
  color: string;
  startMinutes: number;
  endMinutes: number;
  autoClosed: boolean;
}
```

칸을 그리는 자리에서 `opacity`와 `title`을 세그먼트에 맞춰 바꾼다. 현재 `opacity: 0.8` 고정인 자리를:

```tsx
                  title={
                    [seg?.subjectLabel, allowed ? '허용앱' : null, seg?.autoClosed ? '자동 마감' : null]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  className={seg ? undefined : 'bg-surface-container'}
                  style={
                    seg
                      ? {
                          backgroundColor: seg.color,
                          // 자동 마감은 "3시간 공부했다"가 아니라 상한이다. 확정치와 같은
                          // 진하기로 그리면 매니저가 추정치를 사실로 읽는다.
                          opacity: seg.autoClosed ? 0.35 : 0.8,
                          backgroundImage: allowed
                            ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0 2px, transparent 2px 4px)'
                            : undefined,
                        }
                      : undefined
                  }
```

- [ ] **Step 2: 세그먼트를 만들 때 값을 넘긴다**

`src/screens/shared/ChecklistTimeline.tsx`의 `segments.push(...)`:

```ts
      segments.push({ subjectLabel: subject.label, color, startMinutes, endMinutes, autoClosed: session.autoClosed });
```

같은 파일에서 항목별 학습 시간을 문자로 보여주는 자리에 표시를 붙인다. 지금 이렇게 되어 있는 자리:

```tsx
                {elapsedSeconds > 0 && (
                  <span className="text-sm text-primary font-semibold ml-1">{formatMinutes(Math.round(elapsedSeconds / 60))}</span>
                )}
```

을 바꾼다. 그 항목의 세션 중 하나라도 `autoClosed`면 뒤에 표기한다:

```tsx
                {elapsedSeconds > 0 && (
                  <span className="text-sm text-primary font-semibold ml-1">
                    {formatMinutes(Math.round(elapsedSeconds / 60))}
                    {hasAutoClosedByItem[item.id] && (
                      <span className="text-[10px] font-normal text-on-surface-variant ml-0.5">(자동 마감)</span>
                    )}
                  </span>
                )}
```

`hasAutoClosedByItem`은 `elapsedSecondsByItem`을 채우는 같은 루프에서 함께 채운다:

```ts
  const elapsedSecondsByItem: Record<string, number> = {};
  const hasAutoClosedByItem: Record<string, boolean> = {};
```

루프 안, `elapsedSeconds += session.durationSeconds;` 아래:

```ts
      if (session.autoClosed) hasAutoClosedByItem[item.id] = true;
```

**합계에서 빼지 않는다.** 3시간은 상한이지 0이 아니고, 빼면 결함 2(시간이 사라진다)를 다시 만드는 셈이다.

- [ ] **Step 3: 게이트를 돌린다**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: 전부 통과. `TimelineSegment`에 필수 필드가 생겼으므로 세그먼트를 만드는 다른 자리가 있으면 `tsc`가 짚어준다.

- [ ] **Step 4: 커밋**

```bash
git add src/screens/shared/TimelineColumn.tsx src/screens/shared/ChecklistTimeline.tsx
git commit -m "feat: show auto-closed study sessions as an estimate, not a fact"
```

---

### Task 6: 릴리즈 APK와 문서

**Files:**
- Modify: `dev/active/distraction-stop/distraction-stop-context.md`

- [ ] **Step 1: 웹 자산을 빌드하고 동기화한다**

```bash
npm run build
npx cap sync android
```

`npx cap sync android`가 추적 중인 생성 파일(`android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`)을 바꿀 수 있다. **커밋하지 않는다.** 바뀌었으면 보고만 하고 작업 트리에 남긴다.

- [ ] **Step 2: 릴리즈 APK를 만든다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:assembleRelease --console=plain
```

`JAVA_HOME`은 필수다. 기본값은 JDK 17이라 `invalid source release: 21`로 죽고, Android Studio JBR은 JDK 25라 Gradle 8.14.3이 아예 거부한다.

**반드시 `assembleRelease`다.** 학생 휴대폰에는 릴리즈 서명 빌드가 깔려 있어서 디버그 APK는 서명 불일치로 설치가 거부된다. 키스토어는 `android/app/study-buddy-release.jks`, 설정은 `android/app/keystore.properties`에 이미 있다.

APK의 절대 경로와 MB 단위 크기를 보고한다.

- [ ] **Step 3: 문서를 갱신한다**

`dev/active/distraction-stop/distraction-stop-context.md`의 `**Last Updated**`를 `2026-09-01`로 바꾸고, `## 의사결정 로그`에 항목 하나를 덧붙인다:

```markdown
### 2026-09-01 — 학습 세션 기록 정직성

"타이머가 백그라운드에서 돌게 해달라"는 요청을 받고 코드를 읽었더니 그건 이미 되고 있었다.
학습 시간은 `started_at` 기준으로 계산되므로 화면을 끄거나 앱이 죽어도 정확하다. 포그라운드
서비스를 만들지 않았다.

대신 같은 코드에서 결함 셋이 나왔고, 셋 다 "학생이 멈춤을 안 눌렀을 때 매니저의 기록이
거짓이 된다"는 하나의 실패였다. (1) 열린 세션에 상한이 없어 12시간짜리 숫자가 뜬다.
(2) 자정을 넘긴 세션은 복구 스캔이 오늘 항목만 보기 때문에 영영 닫히지 않고, 닫히지 않은
세션은 매니저 화면에서 통째로 사라진다. (3) `endStudySession`이 duration에 null을 덮어써
같은 방식으로 시간을 지운다.

상한은 3시간 — 딴짓 멈춰가 이미 쓰는 값과 같게 두어 학생이 겪는 규칙을 하나로 유지한다.
자동으로 닫힌 세션은 `auto_closed`로 표시하고 매니저 화면에서 채도를 낮춰 그린다. 3시간은
상한이지 사실이 아니므로 확정치처럼 보이면 안 된다. 다만 합계에는 포함한다 — 빼면 (2)를
다시 만드는 셈이다.

마이그레이션 0022는 컬럼 추가와 함께 (3)이 이미 망가뜨린 행을 복구한다. 그 값은 추측이
아니라 `ended_at - started_at`에서 그대로 나오므로 `auto_closed`를 세우지 않는다.
```

- [ ] **Step 4: 커밋**

```bash
git add dev/active/distraction-stop/distraction-stop-context.md
git commit -m "docs: record the study-session honesty decision"
```

`git add -A`나 `git add .`를 쓰지 않는다 — 이 브랜치에는 다른 작업의 변경이 섞여 있을 수 있다.
