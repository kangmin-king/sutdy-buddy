# Missed Homework Redistribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface homework a student missed on a past day (currently invisible once "today" rolls forward), auto-redistribute unmet page-range homework across remaining days, show per-day completion on both calendars, and redesign the "오늘의 할 일" button — per `docs/superpowers/specs/2026-08-07-missed-homework-redistribution-design.md`.

**Architecture:** A new pure function (`computeMissedHomeworkRedistribution`) computes, per page-range homework range, how far the student actually got (max end-page among completed items) and re-splits the remainder across not-yet-completed today/future dates using the existing `splitPagesAcrossDates`. Two call sites run it automatically on load: a `useEffect` for the student's own account, and inline inside `loadStudentPlannerItems` for a manager viewing a student. A new shared `DayProgressRing` component wraps the existing calendar day-circle markup (unchanged) in a conic-gradient ring showing that day's completion %. `StudentHome.tsx` gains a "yesterday's misses" banner above the existing todo button, and the todo button itself gets a post-it visual redesign.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind, Supabase (Postgres), Vitest.

## Global Constraints

- Auto-redistribution applies **only** to homework linked to a page-range `ExamSubjectRange` (`rangeLabel` matching `^\d+~\d+페이지$`). Free-input homework (모의고사 등) and self-added plans (`source: 'self'`) are never redistributed — they only get the "오늘 일정에 추가하기" copy-forward action.
- A missed day's own `PlannerItem` row is never modified or deleted by redistribution — it stays as the historical record that drives the calendar's incomplete marker and the "어제 못한 숙제" banner.
- Redistribution writes must be idempotent: if the computed `pageRange` for an item already matches what's stored, skip that write. The function runs on every load, so this must hold with zero unnecessary Supabase calls on a no-op run.
- Every write follows the existing optimistic-update pattern already used throughout `AppStateContext.tsx`: update local state first, then write to Supabase, `console.error` + `state.error = WRITE_FAILURE_MESSAGE` on failure. No new try/catch-and-rollback pattern.
- The calendar day-circle's existing conditional classes (selected/today/tutoring-day/red-day colors, exam ring) are not changed — `DayProgressRing` only wraps them in an outer ring, never replaces their markup.
- No mascot artwork (carrot/rabbit) is implemented in this plan — the completion ring uses the app's existing `#366095` primary color, matching the "범위 밖" note in the spec.

---

### Task 1: Pure function `computeMissedHomeworkRedistribution`

**Files:**
- Modify: `src/lib.ts`
- Test: `src/lib.test.ts`

**Interfaces:**
- Produces: `computeMissedHomeworkRedistribution(items: PlannerItem[], ranges: ExamSubjectRange[], today: DateKey): MissedHomeworkUpdate[]` where `MissedHomeworkUpdate = { id: string; pageRange: string }`. Consumed by Task 2 and Task 3.
- Consumes: existing `splitPagesAcrossDates(startPage: number, endPage: number, selectedDates: DateKey[]): { date: DateKey; pageRange: string }[]` (already in `src/lib.ts`).

- [ ] **Step 1: Write the failing tests**

Add to `src/lib.test.ts`, after the existing `splitPagesAcrossDates` describe block (find it with the existing import list at the top of the file — add `computeMissedHomeworkRedistribution` to the import from `./lib`, and `ExamSubjectRange` to the type import from `./types`):

```ts
function examSubjectRange(overrides: Partial<ExamSubjectRange>): ExamSubjectRange {
  return {
    id: 'r1',
    examSubjectId: 'es1',
    material: '쎈 수학',
    rangeLabel: '1~30페이지',
    assignedDates: ['2026-08-07', '2026-08-08', '2026-08-09'],
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeMissedHomeworkRedistribution', () => {
  it('returns nothing when no past day was missed', () => {
    const range = examSubjectRange({});
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~10페이지', examSubjectRangeId: 'r1', status: 'completed' }),
      plannerItem({ id: 'b', date: '2026-08-08', pageRange: '11~20페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'c', date: '2026-08-09', pageRange: '21~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    expect(computeMissedHomeworkRedistribution(items, [range], '2026-08-08')).toEqual([]);
  });

  it('redistributes the full range when the missed day made zero progress', () => {
    const range = examSubjectRange({});
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~10페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'b', date: '2026-08-08', pageRange: '11~20페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'c', date: '2026-08-09', pageRange: '21~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    const result = computeMissedHomeworkRedistribution(items, [range], '2026-08-08');
    expect(result).toEqual(
      expect.arrayContaining([
        { id: 'b', pageRange: '1~15페이지' },
        { id: 'c', pageRange: '16~30페이지' },
      ])
    );
    expect(result).toHaveLength(2);
  });

  it('only redistributes what is left past the last completed page', () => {
    const range = examSubjectRange({});
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~10페이지', examSubjectRangeId: 'r1', status: 'completed' }),
      plannerItem({ id: 'b', date: '2026-08-08', pageRange: '11~20페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'c', date: '2026-08-09', pageRange: '21~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    const result = computeMissedHomeworkRedistribution(items, [range], '2026-08-09');
    expect(result).toEqual([{ id: 'c', pageRange: '11~30페이지' }]);
  });

  it('is idempotent: computing again after applying the updates returns nothing', () => {
    const range = examSubjectRange({});
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~10페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'b', date: '2026-08-08', pageRange: '1~15페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'c', date: '2026-08-09', pageRange: '16~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    expect(computeMissedHomeworkRedistribution(items, [range], '2026-08-08')).toEqual([]);
  });

  it('ignores free-input ranges (not a page-range label)', () => {
    const range = examSubjectRange({ rangeLabel: '1회 모의고사 풀이 및 채점' });
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1회 모의고사 풀이 및 채점', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    expect(computeMissedHomeworkRedistribution(items, [range], '2026-08-08')).toEqual([]);
  });

  it('returns nothing when there are no future dates left to redistribute into', () => {
    const range = examSubjectRange({ assignedDates: ['2026-08-07'] });
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    expect(computeMissedHomeworkRedistribution(items, [range], '2026-08-08')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib.test.ts -t computeMissedHomeworkRedistribution`
Expected: FAIL with "computeMissedHomeworkRedistribution is not defined" (or import error)

- [ ] **Step 3: Implement the function**

In `src/lib.ts`, change the top type import to add `ExamSubjectRange`:

```ts
import type { ScheduleBlock, PlannerItem, StudyMaterial, DateKey, HomeworkAssignment, StudySession, ExamSubjectRange } from './types';
```

Add this after the existing `splitPagesAcrossDates` function:

```ts
export interface MissedHomeworkUpdate {
  id: string;
  pageRange: string;
}

// 놓친 날(과거 날짜인데 완료 안 된) 페이지 범위 숙제가 있으면, 완료된 항목들 중 가장 뒤 페이지를
// "실제 도달 지점"으로 보고 남은 분량을 아직 완료 안 된 오늘/미래 날짜에 다시 나눠 담는다.
// 자유입력(페이지 형식이 아닌) 범위는 대상이 아니다. 놓친 날 항목 자체는 절대 건드리지 않는다 —
// 캘린더에 남을 미완료 기록이자 "어제 못한 숙제" 배너의 원본이다. 계산 결과가 이미 저장된 값과
// 같으면 그 항목은 결과에서 빠진다(멱등성 — 매 로드마다 돌아도 안전).
export function computeMissedHomeworkRedistribution(
  items: PlannerItem[],
  ranges: ExamSubjectRange[],
  today: DateKey
): MissedHomeworkUpdate[] {
  const updates: MissedHomeworkUpdate[] = [];

  for (const range of ranges) {
    const totalMatch = range.rangeLabel.match(/^(\d+)~(\d+)페이지$/);
    if (!totalMatch) continue;
    const totalStart = Number(totalMatch[1]);
    const totalEnd = Number(totalMatch[2]);

    const rangeItems = items.filter((i) => i.examSubjectRangeId === range.id);
    if (rangeItems.length === 0) continue;

    const hasMissedPastDay = rangeItems.some((i) => i.date < today && i.status !== 'completed');
    if (!hasMissedPastDay) continue;

    let progressPoint = totalStart - 1;
    for (const item of rangeItems) {
      if (item.status !== 'completed') continue;
      const nums = item.pageRange.match(/\d+/g);
      if (!nums || nums.length === 0) continue;
      const end = Number(nums[nums.length - 1]);
      if (end > progressPoint) progressPoint = end;
    }
    if (progressPoint >= totalEnd) continue;

    const futureItems = rangeItems.filter((i) => i.date >= today && i.status !== 'completed');
    if (futureItems.length === 0) continue;

    const futureDates = Array.from(new Set(futureItems.map((i) => i.date))).sort();
    const distribution = splitPagesAcrossDates(progressPoint + 1, totalEnd, futureDates);

    for (const { date, pageRange } of distribution) {
      for (const item of futureItems.filter((i) => i.date === date)) {
        if (item.pageRange !== pageRange) updates.push({ id: item.id, pageRange });
      }
    }
  }

  return updates;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib.test.ts -t computeMissedHomeworkRedistribution`
Expected: PASS (6 tests)

- [ ] **Step 5: Full test suite + typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, zero type errors

- [ ] **Step 6: Commit**

```bash
git add src/lib.ts src/lib.test.ts
git commit -m "feat: add computeMissedHomeworkRedistribution pure function"
```

---

### Task 2: Auto-redistribute on load — student's own account

**Files:**
- Modify: `src/state/AppStateContext.tsx`

**Interfaces:**
- Consumes: `computeMissedHomeworkRedistribution` from Task 1.

- [ ] **Step 1: Import the new function**

In `src/state/AppStateContext.tsx`, change:

```ts
import { uid, addDaysToKey, todayKey, shouldGenerateHomeworkItem, splitPagesAcrossDates } from '../lib';
```

to:

```ts
import { uid, addDaysToKey, todayKey, shouldGenerateHomeworkItem, splitPagesAcrossDates, computeMissedHomeworkRedistribution } from '../lib';
```

- [ ] **Step 2: Add the redistribution `useEffect`**

Find the existing "지연 숙제 생성" `useEffect` (it ends with `}, [state.loading, state.profile, state.plannerItems, state.homeworkAssignments, actions]);` immediately followed by `return <AppStateContext.Provider value={{ state, actions }}>{children}</AppStateContext.Provider>;`). Insert this new effect between them:

```ts
  // 밀린 숙제 자동 재분배: 학생 본인 계정에서, 과거 날짜에 놓친 페이지 범위 숙제가 있으면 남은
  // 분량을 오늘/미래 날짜에 자동으로 다시 나눠 담는다. 계산 결과가 기존과 같으면(이미 반영됨)
  // updates가 비어 있어 아무 것도 쓰지 않는다 — 매 렌더마다 돌아도 안전하다.
  React.useEffect(() => {
    if (state.loading || !state.profile || state.profile.role !== 'student') return;
    const items = Object.values(state.plannerItems).flat();
    const updates = computeMissedHomeworkRedistribution(items, state.examSubjectRanges, todayKey());
    if (updates.length === 0) return;

    const updatesById = new Map(updates.map((u) => [u.id, u.pageRange]));
    const nextPlannerItems: Record<DateKey, PlannerItem[]> = {};
    for (const [date, dateItems] of Object.entries(state.plannerItems)) {
      nextPlannerItems[date] = dateItems.map((i) => (updatesById.has(i.id) ? { ...i, pageRange: updatesById.get(i.id)! } : i));
    }
    setState((s) => ({ ...s, plannerItems: nextPlannerItems }));

    Promise.all(
      updates.map(({ id, pageRange }) => supabase.from('sb_planner_items').update({ page_range: pageRange }).eq('id', id))
    ).then((results) => {
      if (results.some((r) => r.error)) console.error('missed-homework redistribute failed');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loading, state.profile, state.plannerItems, state.examSubjectRanges]);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: zero type errors

- [ ] **Step 4: Manual verification**

Run: `npx vitest run`
Expected: all existing tests still pass (this task adds no new automated tests — it's integration wiring covered by Task 1's pure-function tests and Task 8's manual browser check).

- [ ] **Step 5: Commit**

```bash
git add src/state/AppStateContext.tsx
git commit -m "feat: auto-redistribute missed page-range homework on student load"
```

---

### Task 3: Auto-redistribute on load — manager viewing a student

**Files:**
- Modify: `src/state/AppStateContext.tsx`

**Interfaces:**
- Consumes: `computeMissedHomeworkRedistribution` from Task 1.

- [ ] **Step 1: Update `loadStudentPlannerItems`**

Find this action (search for `async loadStudentPlannerItems(studentId)`):

```ts
      async loadStudentPlannerItems(studentId) {
        const { data, error } = await supabase.from('sb_planner_items').select('*').eq('user_id', studentId).order('order');
        if (error) {
          console.error('loadStudentPlannerItems failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          return;
        }
        const grouped = groupByDate((data ?? []).map(plannerItemFromRow));
        setState((s) => ({ ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: grouped } }));
      },
```

Replace it with:

```ts
      async loadStudentPlannerItems(studentId) {
        const { data, error } = await supabase.from('sb_planner_items').select('*').eq('user_id', studentId).order('order');
        if (error) {
          console.error('loadStudentPlannerItems failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          return;
        }
        let grouped = groupByDate((data ?? []).map(plannerItemFromRow));

        // 밀린 숙제 자동 재분배: 매니저가 이 학생 화면을 열 때도 학생 본인이 열 때와 동일하게 계산한다.
        const studentRanges = state.examSubjectRanges.filter((r) => {
          const subject = state.examSubjects.find((s) => s.id === r.examSubjectId);
          const exam = subject ? state.examRecords.find((e) => e.id === subject.examId) : undefined;
          return exam?.studentId === studentId;
        });
        const updates = computeMissedHomeworkRedistribution(Object.values(grouped).flat(), studentRanges, todayKey());
        if (updates.length > 0) {
          const updatesById = new Map(updates.map((u) => [u.id, u.pageRange]));
          grouped = Object.fromEntries(
            Object.entries(grouped).map(([date, dateItems]) => [
              date,
              dateItems.map((i) => (updatesById.has(i.id) ? { ...i, pageRange: updatesById.get(i.id)! } : i)),
            ])
          );
          const results = await Promise.all(
            updates.map(({ id, pageRange }) => supabase.from('sb_planner_items').update({ page_range: pageRange }).eq('id', id))
          );
          if (results.some((r) => r.error)) console.error('loadStudentPlannerItems (redistribute) failed');
        }

        studentPlannerItemsRef.current = { ...studentPlannerItemsRef.current, [studentId]: grouped };
        setState((s) => ({ ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: grouped } }));
      },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: zero type errors

- [ ] **Step 3: Manual verification**

Run: `npx vitest run`
Expected: all existing tests still pass

- [ ] **Step 4: Commit**

```bash
git add src/state/AppStateContext.tsx
git commit -m "feat: auto-redistribute missed homework when a manager loads a student"
```

---

### Task 4: Shared `DayProgressRing` component

**Files:**
- Create: `src/screens/shared/DayProgressRing.tsx`

**Interfaces:**
- Produces: `DayProgressRing({ percent, size, children }: { percent: number | null; size?: number; children: React.ReactNode })`. `percent: null` renders no ring. Consumed by Task 5 and Task 6.

- [ ] **Step 1: Write the component**

```tsx
import React from 'react';

// 과거 날짜의 완료율을 얇은 링으로 보여준다 — 12시 방향부터 시계 방향으로 채워진다. 안쪽 children은
// 기존 날짜 원(선택/오늘/과외 요일 배경색 등)을 그대로 감싸기만 해서, 완료율 표시가 추가돼도 기존
// 시각 상태는 전혀 안 바뀐다. percent가 null이면(오늘/미래 날짜, 또는 그날 항목이 없음) 링 없이
// children만 그대로 렌더한다.
export function DayProgressRing({
  percent,
  size = 38,
  children,
}: {
  percent: number | null;
  size?: number;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties =
    percent == null ? {} : { background: `conic-gradient(#366095 0% ${percent}%, #e5e5e5 ${percent}% 100%)` };
  return (
    <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: size, height: size, ...style }}>
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: zero type errors (component isn't wired in yet, so this only checks the file itself is valid)

- [ ] **Step 3: Commit**

```bash
git add src/screens/shared/DayProgressRing.tsx
git commit -m "feat: add DayProgressRing shared component"
```

---

### Task 5: Wire completion ring into `StudentCalendar.tsx`

**Files:**
- Modify: `src/screens/student/StudentCalendar.tsx`

**Interfaces:**
- Consumes: `DayProgressRing` from Task 4, `getPlannerProgress` from `src/lib.ts` (already exists — `getPlannerProgress(items: PlannerItem[]): { percent: number; completed: number; total: number }`).

- [ ] **Step 1: Add imports**

Change:

```ts
import { todayKey, monthGrid, addMonthsToKey, getTutoringDaysInRange, getHolidayName } from '../../lib';
```

to:

```ts
import { todayKey, monthGrid, addMonthsToKey, getTutoringDaysInRange, getHolidayName, getPlannerProgress } from '../../lib';
```

Add below the existing `Icon, Card, TopAppBar` import:

```ts
import { DayProgressRing } from '../shared/DayProgressRing';
```

- [ ] **Step 2: Wrap the day circle**

Find the day-cell `return` inside the `grid.map((d) => { ... })` block:

```tsx
          const hasExam = examsByDate.has(d.key);
          return (
            <button key={d.key} onClick={() => setSelectedDate(d.key)} className="flex flex-col items-center py-1.5">
              <span
                className={`relative w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                  isSelected
                    ? 'bg-primary text-on-primary font-bold'
                    : isTutoringDay
                      ? `bg-tertiary-container/40 ${isRedDay ? 'text-error' : 'text-on-surface'}`
                      : isToday
                        ? 'border border-primary text-primary font-semibold'
                        : d.inCurrentMonth
                          ? isRedDay
                            ? 'text-error'
                            : 'text-on-surface'
                          : isRedDay
                            ? 'text-error/40'
                            : 'text-outline-variant'
                } ${hasExam ? 'ring-2 ring-error' : ''}`}
              >
                {d.date}
              </span>
              <span className="flex items-center gap-0.5 mt-0.5 h-1">
                {hasItems && <span className="w-1 h-1 rounded-full bg-secondary" />}
                {hasExam && <span className="w-1 h-1 rounded-full bg-error" />}
              </span>
            </button>
          );
```

Replace it with:

```tsx
          const hasExam = examsByDate.has(d.key);
          const percent = d.key < today && dayItems.length > 0 ? getPlannerProgress(dayItems).percent : null;
          return (
            <button key={d.key} onClick={() => setSelectedDate(d.key)} className="flex flex-col items-center py-1.5">
              <DayProgressRing percent={percent}>
                <span
                  className={`relative w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                    isSelected
                      ? 'bg-primary text-on-primary font-bold'
                      : isTutoringDay
                        ? `bg-tertiary-container/40 ${isRedDay ? 'text-error' : 'text-on-surface'}`
                        : isToday
                          ? 'border border-primary text-primary font-semibold'
                          : d.inCurrentMonth
                            ? isRedDay
                              ? 'text-error'
                              : 'text-on-surface'
                            : isRedDay
                              ? 'text-error/40'
                              : 'text-outline-variant'
                  } ${hasExam ? 'ring-2 ring-error' : ''}`}
                >
                  {d.date}
                </span>
              </DayProgressRing>
              <span className="flex items-center gap-0.5 mt-0.5 h-1">
                {hasItems && d.key >= today && <span className="w-1 h-1 rounded-full bg-secondary" />}
                {hasExam && <span className="w-1 h-1 rounded-full bg-error" />}
              </span>
            </button>
          );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: zero type errors

- [ ] **Step 4: Manual browser verification**

Start the dev server, open the student app's 캘린더 tab. Confirm: past days with a mix of completed/incomplete items show a partial ring; past days fully completed show a full ring; today and future days show no ring; the exam-day red ring and the selected/today circle styling are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/screens/student/StudentCalendar.tsx
git commit -m "feat: show completion ring on past days in student calendar"
```

---

### Task 6: Wire completion ring into `ManagerCalendar.tsx`

**Files:**
- Modify: `src/screens/manager/ManagerCalendar.tsx`

**Interfaces:**
- Consumes: `DayProgressRing` from Task 4, `getPlannerProgress` from `src/lib.ts`.

- [ ] **Step 1: Add imports**

Change:

```ts
import { todayKey, monthGrid, addMonthsToKey, getTutoringDaysInRange, getHolidayName } from '../../lib';
```

to:

```ts
import { todayKey, monthGrid, addMonthsToKey, getTutoringDaysInRange, getHolidayName, getPlannerProgress } from '../../lib';
```

Add below the existing `PlannerItemRow` import:

```ts
import { DayProgressRing } from '../shared/DayProgressRing';
```

- [ ] **Step 2: Wrap the day circle**

Find the identical day-cell block (same markup as `StudentCalendar.tsx` before Task 5's change — `ManagerCalendar.tsx` has the same structure):

```tsx
          const hasExam = examsByDate.has(d.key);
          return (
            <button key={d.key} onClick={() => setSelectedDate(d.key)} className="flex flex-col items-center py-1.5">
              <span
                className={`relative w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                  isSelected
                    ? 'bg-primary text-on-primary font-bold'
                    : isTutoringDay
                      ? `bg-tertiary-container/40 ${isRedDay ? 'text-error' : 'text-on-surface'}`
                      : isToday
                        ? 'border border-primary text-primary font-semibold'
                        : d.inCurrentMonth
                          ? isRedDay
                            ? 'text-error'
                            : 'text-on-surface'
                          : isRedDay
                            ? 'text-error/40'
                            : 'text-outline-variant'
                } ${hasExam ? 'ring-2 ring-error' : ''}`}
              >
                {d.date}
              </span>
              <span className="flex items-center gap-0.5 mt-0.5 h-1">
                {hasItems && <span className="w-1 h-1 rounded-full bg-secondary" />}
                {hasExam && <span className="w-1 h-1 rounded-full bg-error" />}
              </span>
            </button>
          );
```

Replace it with the same pattern as Task 5:

```tsx
          const hasExam = examsByDate.has(d.key);
          const percent = d.key < today && dayItems.length > 0 ? getPlannerProgress(dayItems).percent : null;
          return (
            <button key={d.key} onClick={() => setSelectedDate(d.key)} className="flex flex-col items-center py-1.5">
              <DayProgressRing percent={percent}>
                <span
                  className={`relative w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                    isSelected
                      ? 'bg-primary text-on-primary font-bold'
                      : isTutoringDay
                        ? `bg-tertiary-container/40 ${isRedDay ? 'text-error' : 'text-on-surface'}`
                        : isToday
                          ? 'border border-primary text-primary font-semibold'
                          : d.inCurrentMonth
                            ? isRedDay
                              ? 'text-error'
                              : 'text-on-surface'
                            : isRedDay
                              ? 'text-error/40'
                              : 'text-outline-variant'
                  } ${hasExam ? 'ring-2 ring-error' : ''}`}
                >
                  {d.date}
                </span>
              </DayProgressRing>
              <span className="flex items-center gap-0.5 mt-0.5 h-1">
                {hasItems && d.key >= today && <span className="w-1 h-1 rounded-full bg-secondary" />}
                {hasExam && <span className="w-1 h-1 rounded-full bg-error" />}
              </span>
            </button>
          );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: zero type errors

- [ ] **Step 4: Manual browser verification**

Open the manager app's 캘린더 tab for a student with some past completed/incomplete homework. Confirm the same ring behavior as Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/screens/manager/ManagerCalendar.tsx
git commit -m "feat: show completion ring on past days in manager calendar"
```

---

### Task 7: "어제 못한 숙제" banner + copy-to-today on `StudentHome.tsx`

**Files:**
- Modify: `src/screens/student/StudentHome.tsx`

**Interfaces:**
- Produces: `StudentHomeScreen` now accepts `{ onNavigateToCalendar?: () => void }`. Consumed by Task 8.
- Consumes: existing `actions.addPlannerItem(date: DateKey, item: Omit<PlannerItem, 'id' | 'order'>): Promise<void>` (already in `AppStateContext.tsx` — no changes needed to it), `addDaysToKey` from `src/lib.ts`.

- [ ] **Step 1: Update imports and the component signature**

Change:

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar, Card, Icon } from '../../primitives';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';
```

to:

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, addDaysToKey } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar, Card, Icon } from '../../primitives';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';
import type { PlannerItem } from '../../types';
```

Change:

```tsx
export default function StudentHomeScreen() {
  const { state, actions } = useAppState();
  const today = todayKey();
```

to:

```tsx
export default function StudentHomeScreen({ onNavigateToCalendar }: { onNavigateToCalendar?: () => void } = {}) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const yesterday = addDaysToKey(today, -1);
```

- [ ] **Step 2: Add the missed-yesterday derivation and copy-forward handler**

Right after the existing `const allTodayItems = ...` line, add:

```tsx
  const missedYesterday = (state.plannerItems[yesterday] ?? []).filter((it) => it.status !== 'completed');
  const isPageRangeItem = (it: PlannerItem) => {
    if (!it.examSubjectRangeId) return false;
    const range = state.examSubjectRanges.find((r) => r.id === it.examSubjectRangeId);
    return !!range && /^\d+~\d+페이지$/.test(range.rangeLabel);
  };
  const handleAddToToday = (it: PlannerItem) => {
    actions.addPlannerItem(today, {
      date: today,
      subjectId: it.subjectId,
      startTime: it.startTime,
      studyType: it.studyType,
      material: it.material,
      unit: it.unit,
      pageRange: it.pageRange,
      endTime: it.endTime,
      difficulty: it.difficulty,
      restPattern: it.restPattern,
      mustDo: it.mustDo,
      status: 'planned',
      actualMinutes: null,
      understanding: null,
      partialReason: null,
      incompleteReason: null,
      source: it.source,
      homeworkAssignmentId: null,
      examSubjectRangeId: null,
    });
  };
```

- [ ] **Step 3: Render the banner above the todo button**

Find:

```tsx
      <button
        onClick={() => setShowTodo(true)}
        className="mt-3 mb-4 inline-flex items-center gap-1 rounded-lg bg-tertiary-container/30 px-3 py-1.5 text-xs font-semibold text-on-surface"
      >
        📌 오늘의 할 일
      </button>
```

Replace it with (banner first, then the existing button unchanged for now — Task 8 restyles the button itself):

```tsx
      {missedYesterday.length > 0 && (
        <div className="mt-3 rounded-xl bg-error/10 border border-error/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-error">어제 못한 숙제</p>
            <button onClick={onNavigateToCalendar} className="text-[11px] text-on-surface-variant underline">
              지금까지 밀린 과제 보기
            </button>
          </div>
          <div className="space-y-1.5">
            {missedYesterday.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2">
                <p className="text-xs">
                  {getSubject(it.subjectId).label} · {it.material || '할 일'}
                </p>
                {!isPageRangeItem(it) && (
                  <button onClick={() => handleAddToToday(it)} className="text-[11px] font-semibold text-primary shrink-0">
                    오늘 일정에 추가하기
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setShowTodo(true)}
        className="mt-3 mb-4 inline-flex items-center gap-1 rounded-lg bg-tertiary-container/30 px-3 py-1.5 text-xs font-semibold text-on-surface"
      >
        📌 오늘의 할 일
      </button>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: zero type errors

- [ ] **Step 5: Manual browser verification**

As a student with a past-dated incomplete self-added plan or free-input homework item, confirm the banner shows above the todo button, "오늘 일정에 추가하기" creates a same-day copy visible in today's list, and the banner disappears once no items remain incomplete from yesterday. Confirm a missed page-range homework item shows in the banner with no "추가하기" button (since it was already auto-redistributed by Task 2).

- [ ] **Step 6: Commit**

```bash
git add src/screens/student/StudentHome.tsx
git commit -m "feat: show yesterday's missed homework banner on student home"
```

---

### Task 8: Wire `onNavigateToCalendar` from `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `StudentHomeScreen`'s `onNavigateToCalendar` prop from Task 7.

- [ ] **Step 1: Pass the callback**

Find in `StudentAppShell`:

```tsx
      {activeTab === 'home' && <StudentHomeScreen />}
      {activeTab === 'calendar' && <StudentCalendarScreen />}
```

Replace with:

```tsx
      {activeTab === 'home' && <StudentHomeScreen onNavigateToCalendar={() => setActiveTab('calendar')} />}
      {activeTab === 'calendar' && <StudentCalendarScreen />}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: zero type errors

- [ ] **Step 3: Manual browser verification**

Click "지금까지 밀린 과제 보기" in the banner from Task 7 and confirm it switches to the 캘린더 tab.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire home banner's 밀린 과제 보기 button to the calendar tab"
```

---

### Task 9: "오늘의 할 일" post-it button redesign

**Files:**
- Modify: `src/screens/student/StudentHome.tsx`

- [ ] **Step 1: Replace the button markup**

Find (this is the same button from Task 7, now unstyled from the pin/pill look):

```tsx
      <button
        onClick={() => setShowTodo(true)}
        className="mt-3 mb-4 inline-flex items-center gap-1 rounded-lg bg-tertiary-container/30 px-3 py-1.5 text-xs font-semibold text-on-surface"
      >
        📌 오늘의 할 일
      </button>
```

Replace it with:

```tsx
      <button
        onClick={() => setShowTodo(true)}
        className="mt-3 mb-4 relative inline-flex items-center gap-1.5 rounded-tl-sm rounded-tr-sm rounded-br-2xl rounded-bl-sm bg-[#fff4a8] text-[#4a3f10] pl-4 pr-8 py-2.5 text-xs font-bold shadow-md -rotate-3"
      >
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-sm rotate-[8deg]">🥕</span>
        오늘의 할 일
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex flex-col opacity-80">
          <svg width="12" height="7" viewBox="0 0 12 7">
            <path d="M1 1 L6 6 L11 1" stroke="#4a3f10" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="12" height="7" viewBox="0 0 12 7" style={{ marginTop: -3, opacity: 0.5 }}>
            <path d="M1 1 L6 6 L11 1" stroke="#4a3f10" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: zero type errors

- [ ] **Step 3: Manual browser verification**

Confirm the button renders as a slightly rotated yellow post-it with a carrot at the top and a static (non-animated) double chevron on the right, and still opens the todo overlay on click.

- [ ] **Step 4: Commit**

```bash
git add src/screens/student/StudentHome.tsx
git commit -m "style: redesign 오늘의 할 일 button as a post-it with carrot and chevron"
```
