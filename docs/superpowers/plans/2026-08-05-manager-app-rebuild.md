# Manager App Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current bare-bones manager app (student list → homework text form → generic timeline) with a student-selector + 3-tab structure (캘린더/홈/진도관리) that matches the spec at `docs/superpowers/specs/2026-08-05-manager-app-rebuild-design.md`.

**Architecture:** New Supabase tables for exam records/subjects/material-ranges and recurring tutoring schedules + exceptions, all gated by the existing "linked manager" RLS pattern. Two new pure functions (`splitPagesAcrossDates`, `getTutoringDaysInRange`) drive homework-day distribution and calendar tutoring-day display. Homework registration generates `sb_planner_items` rows immediately (no lazy generation) for the specific dates a manager taps in a mini-calendar. `AppStateContext` gains new state slices and actions; three new screens replace `ManagerHomeworkForm.tsx` and the old tab switcher in `App.tsx`.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind, Supabase (Postgres/RLS), Vitest.

## Global Constraints

- DB row types are declared with `type`, never `interface` (breaks Supabase's `GenericSchema` structural matching otherwise) — see the comment atop `src/types/db.ts`.
- Every write action follows the existing optimistic-update pattern: `setState` first (or a `plannerItemsRef`-style synchronous mirror when a value is needed before the next commit), then the async Supabase write, appending `WRITE_FAILURE_MESSAGE` to `state.error` on failure. No try/catch-and-rollback for creates.
- New tables use the `sb_` prefix and enable RLS. Any policy reading another user's row must go through the existing "linked manager" `exists (select 1 from sb_student_manager_links l where l.student_id = ... and l.manager_id = auth.uid())` pattern — never a broad policy that exposes rows to enumeration.
- `sb_planner_items` created by a manager use `source = 'homework'` and are never lazily regenerated — this plan's homework registration is a one-time eager batch insert for the exact dates selected, not a recurring daily-generation rule (that existing mechanism, Tasks 3/6 of the prior plan, is left untouched and unused by this flow).
- Existing legacy screens (`LegacyStudentAppShell` and its children), the student 4-tab app, and `sb_homework_assignments`/`shouldGenerateHomeworkItem` are not modified or deleted — only `ManagerHomeworkForm.tsx` and `App.tsx`'s `ManagerAppShell` are replaced.
- Pure business-logic functions live in `src/lib.ts` with unit tests in `src/lib.test.ts`, following the existing `shouldGenerateHomeworkItem`/`sessionsToTimelineBlocks` pattern (no I/O, deterministic, boundary-tested).

---

### Task 1: Migration 0007 — exam tracking, tutoring schedule, planner-item manager access

**Files:**
- Create: `supabase/migrations/0007_manager_progress_and_schedule.sql`

**Interfaces:**
- Produces: tables `sb_exam_records`, `sb_exam_subjects`, `sb_exam_subject_ranges`, `sb_tutoring_schedules`, `sb_tutoring_schedule_exceptions`; column `sb_student_manager_links.label`; new RLS policies on `sb_planner_items` for linked managers.

- [ ] **Step 1: Write the migration**

```sql
-- 관리자가 자기 화면에서만 보는 학생 별칭 (연필 아이콘으로 수정, 학생 본인/다른 관리자에게는 영향 없음)
alter table sb_student_manager_links add column label text;

-- 시험/평가 항목 (메인 1개 + 수행평가·모의고사 등 추가 가능)
create table sb_exam_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  exam_date date not null,
  is_main boolean not null default false,
  created_at timestamptz not null default now()
);
alter table sb_exam_records enable row level security;
create policy "linked manager manages exam records" on sb_exam_records for all using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_exam_records.student_id and l.manager_id = auth.uid())
) with check (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_exam_records.student_id and l.manager_id = auth.uid())
);

-- 시험 안의 과목별 목표
create table sb_exam_subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references sb_exam_records(id) on delete cascade,
  subject_id text not null,
  target_grade text not null default '',
  target_score text not null default '',
  target_rank text not null default '',
  created_at timestamptz not null default now()
);
alter table sb_exam_subjects enable row level security;
create policy "linked manager manages exam subjects" on sb_exam_subjects for all using (
  exists (
    select 1 from sb_exam_records e
    join sb_student_manager_links l on l.student_id = e.student_id
    where e.id = sb_exam_subjects.exam_id and l.manager_id = auth.uid()
  )
) with check (
  exists (
    select 1 from sb_exam_records e
    join sb_student_manager_links l on l.student_id = e.student_id
    where e.id = sb_exam_subjects.exam_id and l.manager_id = auth.uid()
  )
);

-- 과목에 등록한 교재/범위 이력 (진도관리 탭에 카드로 표시)
create table sb_exam_subject_ranges (
  id uuid primary key default gen_random_uuid(),
  exam_subject_id uuid not null references sb_exam_subjects(id) on delete cascade,
  material text not null,
  range_label text not null,
  assigned_dates date[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table sb_exam_subject_ranges enable row level security;
create policy "linked manager manages exam subject ranges" on sb_exam_subject_ranges for all using (
  exists (
    select 1 from sb_exam_subjects es
    join sb_exam_records e on e.id = es.exam_id
    join sb_student_manager_links l on l.student_id = e.student_id
    where es.id = sb_exam_subject_ranges.exam_subject_id and l.manager_id = auth.uid()
  )
) with check (
  exists (
    select 1 from sb_exam_subjects es
    join sb_exam_records e on e.id = es.exam_id
    join sb_student_manager_links l on l.student_id = e.student_id
    where es.id = sb_exam_subject_ranges.exam_subject_id and l.manager_id = auth.uid()
  )
);

-- 학생별 과외 요일 패턴 (관리자당 1개, 거의 안 바뀜)
create table sb_tutoring_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  weekdays smallint[] not null default '{}', -- 0=일 .. 6=토
  updated_at timestamptz not null default now(),
  unique (student_id, manager_id)
);
alter table sb_tutoring_schedules enable row level security;
create policy "linked manager manages own tutoring schedule" on sb_tutoring_schedules for all using (
  manager_id = auth.uid()
) with check (
  manager_id = auth.uid()
);

-- 특정 날짜 예외 (취소/변경)
create table sb_tutoring_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  original_date date not null,
  new_date date, -- null = 그 날은 취소
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table sb_tutoring_schedule_exceptions enable row level security;
create policy "linked manager manages own tutoring exceptions" on sb_tutoring_schedule_exceptions for all using (
  manager_id = auth.uid()
) with check (
  manager_id = auth.uid()
);

-- 링크된 관리자가 학생 대신 숙제 항목(source='homework')을 만들고, 읽고, 수정할 수 있어야 한다.
-- 현재 sb_planner_items는 "auth.uid() = user_id"만 허용되어 있어 관리자가 학생 이름으로 쓸 수 없다.
create policy "linked manager creates homework items" on sb_planner_items for insert with check (
  source = 'homework' and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_planner_items.user_id and l.manager_id = auth.uid()
  )
);
create policy "linked manager reads planner items" on sb_planner_items for select using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_planner_items.user_id and l.manager_id = auth.uid())
);
create policy "linked manager updates homework items" on sb_planner_items for update using (
  source = 'homework' and exists (
    select 1 from sb_student_manager_links l where l.student_id = sb_planner_items.user_id and l.manager_id = auth.uid()
  )
);

-- RLS 서브쿼리가 행마다 조회하는 컬럼에 인덱스
create index if not exists sb_exam_records_student_id_idx on sb_exam_records (student_id);
create index if not exists sb_exam_subjects_exam_id_idx on sb_exam_subjects (exam_id);
create index if not exists sb_exam_subject_ranges_exam_subject_id_idx on sb_exam_subject_ranges (exam_subject_id);
create index if not exists sb_tutoring_schedules_student_id_idx on sb_tutoring_schedules (student_id);
create index if not exists sb_tutoring_schedule_exceptions_student_id_idx on sb_tutoring_schedule_exceptions (student_id);
```

- [ ] **Step 2: Verify no syntax regressions in prior migrations**

Run: `npx tsc -b` (this migration file isn't typechecked, but confirm the repo still typechecks cleanly before moving on — a broken baseline would hide this task's own mistakes).
Expected: no errors (this task doesn't touch TS files, so this should already pass; if it doesn't, stop and report).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_manager_progress_and_schedule.sql
git commit -m "feat: add exam tracking, tutoring schedule, and manager planner-item access"
```

---

### Task 2: Types, DB row types, and mappers for the new entities

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/types/db.ts`
- Modify: `src/state/mappers.ts`

**Interfaces:**
- Consumes: nothing beyond existing `SubjectId`, `DateKey` types.
- Produces: `ExamRecord`, `ExamSubject`, `ExamSubjectRange`, `TutoringSchedule`, `TutoringScheduleException` domain types; `examRecordFromRow`, `examSubjectFromRow`, `examSubjectRangeFromRow`, `tutoringScheduleFromRow`, `tutoringScheduleExceptionFromRow` mapper functions; `SbStudentManagerLinkRow.label` field.

- [ ] **Step 1: Add domain types to `src/types/index.ts`**

Append after the existing `HomeworkAssignment` interface (around line 101):

```typescript
export interface ExamRecord {
  id: string;
  studentId: string;
  createdBy: string;
  title: string;
  examDate: string; // "YYYY-MM-DD"
  isMain: boolean;
  createdAt: string;
}

export interface ExamSubject {
  id: string;
  examId: string;
  subjectId: SubjectId;
  targetGrade: string;
  targetScore: string;
  targetRank: string;
  createdAt: string;
}

export interface ExamSubjectRange {
  id: string;
  examSubjectId: string;
  material: string;
  rangeLabel: string;
  assignedDates: string[]; // ["YYYY-MM-DD", ...]
  createdAt: string;
}

export interface TutoringSchedule {
  id: string;
  studentId: string;
  managerId: string;
  weekdays: number[]; // 0=일 .. 6=토
  updatedAt: string;
}

export interface TutoringScheduleException {
  id: string;
  studentId: string;
  managerId: string;
  originalDate: string;
  newDate: string | null; // null = 그 날은 취소
  note: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add Row types to `src/types/db.ts`**

Add after `SbStudentManagerLinkRow` (around line 116), and update `SbStudentManagerLinkRow` itself to include `label`:

```typescript
export type SbStudentManagerLinkRow = {
  id: string;
  student_id: string;
  manager_id: string;
  linked_at: string;
  label: string | null;
};

export type SbExamRecordRow = {
  id: string;
  student_id: string;
  created_by: string;
  title: string;
  exam_date: string;
  is_main: boolean;
  created_at: string;
};

export type SbExamSubjectRow = {
  id: string;
  exam_id: string;
  subject_id: SubjectId;
  target_grade: string;
  target_score: string;
  target_rank: string;
  created_at: string;
};

export type SbExamSubjectRangeRow = {
  id: string;
  exam_subject_id: string;
  material: string;
  range_label: string;
  assigned_dates: string[];
  created_at: string;
};

export type SbTutoringScheduleRow = {
  id: string;
  student_id: string;
  manager_id: string;
  weekdays: number[];
  updated_at: string;
};

export type SbTutoringScheduleExceptionRow = {
  id: string;
  student_id: string;
  manager_id: string;
  original_date: string;
  new_date: string | null;
  note: string;
  created_at: string;
};
```

Replace the existing `SbStudentManagerLinkRow` declaration (the old one without `label`) with the version above — do not leave two declarations.

Update the `Database['public']['Tables']` block to register the new tables (insert after the `sb_student_manager_links` entry):

```typescript
      sb_student_manager_links: { Row: SbStudentManagerLinkRow; Insert: Omit<SbStudentManagerLinkRow, 'id' | 'linked_at' | 'label'>; Update: Partial<Pick<SbStudentManagerLinkRow, 'label'>>; Relationships: [] };
      sb_exam_records: { Row: SbExamRecordRow; Insert: Omit<SbExamRecordRow, 'created_at'>; Update: Partial<SbExamRecordRow>; Relationships: [] };
      sb_exam_subjects: { Row: SbExamSubjectRow; Insert: Omit<SbExamSubjectRow, 'created_at'>; Update: Partial<SbExamSubjectRow>; Relationships: [] };
      sb_exam_subject_ranges: { Row: SbExamSubjectRangeRow; Insert: Omit<SbExamSubjectRangeRow, 'created_at'>; Update: Partial<SbExamSubjectRangeRow>; Relationships: [] };
      sb_tutoring_schedules: { Row: SbTutoringScheduleRow; Insert: Omit<SbTutoringScheduleRow, 'id' | 'updated_at'>; Update: Partial<SbTutoringScheduleRow>; Relationships: [] };
      sb_tutoring_schedule_exceptions: { Row: SbTutoringScheduleExceptionRow; Insert: Omit<SbTutoringScheduleExceptionRow, 'id' | 'created_at'>; Update: Partial<SbTutoringScheduleExceptionRow>; Relationships: [] };
```

(This replaces the single-line `sb_student_manager_links` entry that was previously `Update: never` — it now allows updating `label`.)

- [ ] **Step 3: Add mapper functions to `src/state/mappers.ts`**

Add imports for the new types and Row types at the top of the file, then append these functions after `studySessionFromRow` (before `groupByDate`):

```typescript
export function examRecordFromRow(row: SbExamRecordRow): ExamRecord {
  return { id: row.id, studentId: row.student_id, createdBy: row.created_by, title: row.title, examDate: row.exam_date, isMain: row.is_main, createdAt: row.created_at };
}

export function examSubjectFromRow(row: SbExamSubjectRow): ExamSubject {
  return { id: row.id, examId: row.exam_id, subjectId: row.subject_id, targetGrade: row.target_grade, targetScore: row.target_score, targetRank: row.target_rank, createdAt: row.created_at };
}

export function examSubjectRangeFromRow(row: SbExamSubjectRangeRow): ExamSubjectRange {
  return { id: row.id, examSubjectId: row.exam_subject_id, material: row.material, rangeLabel: row.range_label, assignedDates: row.assigned_dates, createdAt: row.created_at };
}

export function tutoringScheduleFromRow(row: SbTutoringScheduleRow): TutoringSchedule {
  return { id: row.id, studentId: row.student_id, managerId: row.manager_id, weekdays: row.weekdays, updatedAt: row.updated_at };
}

export function tutoringScheduleExceptionFromRow(row: SbTutoringScheduleExceptionRow): TutoringScheduleException {
  return { id: row.id, studentId: row.student_id, managerId: row.manager_id, originalDate: row.original_date, newDate: row.new_date, note: row.note, createdAt: row.created_at };
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: clean (no errors). These are pure additive type/mapper changes with no consumers yet.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/types/db.ts src/state/mappers.ts
git commit -m "feat: add types, row types, and mappers for exam tracking and tutoring schedule"
```

---

### Task 3: Pure function `splitPagesAcrossDates`

**Files:**
- Modify: `src/lib.ts`
- Modify: `src/lib.test.ts`

**Interfaces:**
- Produces: `splitPagesAcrossDates(startPage: number, endPage: number, selectedDates: string[]): { date: string; pageRange: string }[]`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib.test.ts` (add `splitPagesAcrossDates` to the existing import from `./lib`):

```typescript
describe('splitPagesAcrossDates', () => {
  it('splits evenly across selected dates, sorted ascending, remainder on the last date', () => {
    const result = splitPagesAcrossDates(1, 40, ['2026-08-09', '2026-08-06', '2026-08-07']);
    expect(result).toEqual([
      { date: '2026-08-06', pageRange: '1~13페이지' },
      { date: '2026-08-07', pageRange: '14~26페이지' },
      { date: '2026-08-09', pageRange: '27~40페이지' },
    ]);
  });

  it('assigns the whole range to a single selected date', () => {
    const result = splitPagesAcrossDates(10, 50, ['2026-08-06']);
    expect(result).toEqual([{ date: '2026-08-06', pageRange: '10~50페이지' }]);
  });

  it('handles a range that divides evenly with no remainder', () => {
    const result = splitPagesAcrossDates(1, 30, ['2026-08-06', '2026-08-07', '2026-08-08']);
    expect(result).toEqual([
      { date: '2026-08-06', pageRange: '1~10페이지' },
      { date: '2026-08-07', pageRange: '11~20페이지' },
      { date: '2026-08-08', pageRange: '21~30페이지' },
    ]);
  });

  it('returns an empty array when no dates are selected', () => {
    expect(splitPagesAcrossDates(1, 40, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib.test.ts -t splitPagesAcrossDates`
Expected: FAIL — `splitPagesAcrossDates is not a function` (or a TypeScript import error).

- [ ] **Step 3: Implement in `src/lib.ts`**

Add after `sessionsToTimelineBlocks` (before `MaterialPace`):

```typescript
// 선택된 날짜(오름차순 정렬) 수만큼 [startPage, endPage] 총 페이지를 균등 분배한다.
// 나머지는 마지막 날짜에 몰아준다. 진도관리 탭에서 교재+범위 등록 시, 관리자가 미니 캘린더에서
// 탭으로 고른 날짜들에 이 결과를 그대로 sb_planner_items로 즉시 일괄 생성한다(지연 생성 없음).
export function splitPagesAcrossDates(startPage: number, endPage: number, selectedDates: DateKey[]): { date: DateKey; pageRange: string }[] {
  if (selectedDates.length === 0) return [];
  const sorted = [...selectedDates].sort();
  const totalPages = endPage - startPage + 1;
  const base = Math.floor(totalPages / sorted.length);
  const remainder = totalPages - base * sorted.length;

  const result: { date: DateKey; pageRange: string }[] = [];
  let cursor = startPage;
  sorted.forEach((date, idx) => {
    const isLast = idx === sorted.length - 1;
    const count = base + (isLast ? remainder : 0);
    const rangeStart = cursor;
    const rangeEnd = cursor + count - 1;
    result.push({ date, pageRange: `${rangeStart}~${rangeEnd}페이지` });
    cursor = rangeEnd + 1;
  });
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib.test.ts -t splitPagesAcrossDates`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib.ts src/lib.test.ts
git commit -m "feat: add splitPagesAcrossDates for homework day-range distribution"
```

---

### Task 4: Pure function `getTutoringDaysInRange`

**Files:**
- Modify: `src/lib.ts`
- Modify: `src/lib.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getTutoringDaysInRange(weekdays: number[], exceptions: { originalDate: string; newDate: string | null }[], startDate: string, endDate: string): string[]`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib.test.ts` (add `getTutoringDaysInRange` to the import from `./lib`):

```typescript
describe('getTutoringDaysInRange', () => {
  it('returns dates matching the weekday pattern within range (0=일..6=토)', () => {
    // 2026-08-06 is a Thursday (4), 2026-08-07 Friday (5), 2026-08-08 Saturday (6)
    const result = getTutoringDaysInRange([5, 6], [], '2026-08-06', '2026-08-12');
    expect(result).toEqual(['2026-08-07', '2026-08-08']);
  });

  it('removes a date cancelled by an exception with newDate null', () => {
    const result = getTutoringDaysInRange([5, 6], [{ originalDate: '2026-08-07', newDate: null }], '2026-08-06', '2026-08-12');
    expect(result).toEqual(['2026-08-08']);
  });

  it('adds the exception newDate when a session is moved, without duplicating an existing tutoring day', () => {
    // moved from Fri 08-07 to Sun 08-09 (not itself a tutoring weekday)
    const result = getTutoringDaysInRange([5, 6], [{ originalDate: '2026-08-07', newDate: '2026-08-09' }], '2026-08-06', '2026-08-12');
    expect(result).toEqual(['2026-08-08', '2026-08-09']);
  });

  it('does not duplicate when a moved date lands on an already-tutoring weekday', () => {
    // moved from Fri 08-07 to Sat 08-08, which is already a tutoring day
    const result = getTutoringDaysInRange([5, 6], [{ originalDate: '2026-08-07', newDate: '2026-08-08' }], '2026-08-06', '2026-08-12');
    expect(result).toEqual(['2026-08-08']);
  });

  it('returns an empty array when no weekdays are set', () => {
    expect(getTutoringDaysInRange([], [], '2026-08-06', '2026-08-12')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib.test.ts -t getTutoringDaysInRange`
Expected: FAIL — function not defined.

- [ ] **Step 3: Implement in `src/lib.ts`**

Add after `splitPagesAcrossDates`:

```typescript
export interface TutoringScheduleExceptionInput {
  originalDate: DateKey;
  newDate: DateKey | null;
}

// 요일 패턴(0=일..6=토)으로 기간 안의 과외 날짜를 계산한 뒤 예외를 적용한다.
// 취소(newDate: null)는 그 날짜를 빼고, 변경(newDate가 있음)은 원래 날짜를 빼고 새 날짜를 추가한다.
// 관리자 캘린더 탭에서 매번 계산해서 보여주며, DB에 미래 날짜 행을 미리 만들지 않는다.
export function getTutoringDaysInRange(
  weekdays: number[],
  exceptions: TutoringScheduleExceptionInput[],
  startDate: DateKey,
  endDate: DateKey
): DateKey[] {
  const weekdaySet = new Set(weekdays);
  const dates = new Set<DateKey>();

  if (weekdaySet.size > 0) {
    let cursor = startDate;
    while (cursor <= endDate) {
      const [y, m, d] = cursor.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      if (weekdaySet.has(dow)) dates.add(cursor);
      cursor = addDaysToKey(cursor, 1);
    }
  }

  for (const exception of exceptions) {
    dates.delete(exception.originalDate);
    if (exception.newDate && exception.newDate >= startDate && exception.newDate <= endDate) {
      dates.add(exception.newDate);
    }
  }

  return Array.from(dates).sort();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib.test.ts -t getTutoringDaysInRange`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass (should be 57 + 4 + 5 = 66), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib.ts src/lib.test.ts
git commit -m "feat: add getTutoringDaysInRange for recurring tutoring-day calendar display"
```

---

### Task 5: AppStateContext — exam tracking and tutoring schedule state/actions

**Files:**
- Modify: `src/state/AppStateContext.tsx`

**Interfaces:**
- Consumes: `examRecordFromRow`, `examSubjectFromRow`, `examSubjectRangeFromRow`, `tutoringScheduleFromRow`, `tutoringScheduleExceptionFromRow` (Task 2), `splitPagesAcrossDates` (Task 3).
- Produces: new `AppState` fields `examRecords: ExamRecord[]`, `examSubjects: ExamSubject[]`, `examSubjectRanges: ExamSubjectRange[]`, `tutoringSchedules: TutoringSchedule[]`, `tutoringScheduleExceptions: TutoringScheduleException[]`, `studentLabels: Record<string, string>` (manager's per-student alias, from `sb_student_manager_links.label`), `studentPlannerItems: Record<string, Record<DateKey, PlannerItem[]>>` (keyed by studentId, for manager-viewed calendars/home); new actions:
  - `updateStudentLabel(studentId: string, label: string): Promise<void>`
  - `createExamRecord(studentId: string, exam: { title: string; examDate: string; isMain: boolean }): Promise<string>` (returns new exam id)
  - `addExamSubject(examId: string, subject: { subjectId: SubjectId; targetGrade: string; targetScore: string; targetRank: string }): Promise<void>`
  - `registerHomeworkRange(studentId: string, examSubjectId: string, params: { subjectId: SubjectId; material: string; startPage: number; endPage: number; selectedDates: string[] }): Promise<void>`
  - `upsertTutoringSchedule(studentId: string, weekdays: number[]): Promise<void>`
  - `addTutoringException(studentId: string, exception: { originalDate: string; newDate: string | null; note: string }): Promise<void>`
  - `loadStudentPlannerItems(studentId: string): Promise<void>`

- [ ] **Step 1: Extend `AppState` and `EMPTY_STATE`**

In the `AppState` interface, add after `managedStudents: Profile[];`:

```typescript
  examRecords: ExamRecord[];
  examSubjects: ExamSubject[];
  examSubjectRanges: ExamSubjectRange[];
  tutoringSchedules: TutoringSchedule[];
  tutoringScheduleExceptions: TutoringScheduleException[];
  studentLabels: Record<string, string>;
  studentPlannerItems: Record<string, Record<DateKey, PlannerItem[]>>;
```

In `EMPTY_STATE`, add matching empty defaults (`[]` for arrays, `{}` for `studentLabels` and `studentPlannerItems`) in the same position.

Add the new type imports at the top of the file (extend the existing `import type { ... } from '../types'` block):

```typescript
  ExamRecord,
  ExamSubject,
  ExamSubjectRange,
  TutoringSchedule,
  TutoringScheduleException,
```

And extend the mapper import block with `examRecordFromRow, examSubjectFromRow, examSubjectRangeFromRow, tutoringScheduleFromRow, tutoringScheduleExceptionFromRow`, and add `splitPagesAcrossDates` to the `import { uid, addDaysToKey, todayKey, shouldGenerateHomeworkItem } from '../lib';` line.

- [ ] **Step 2: Load exam/schedule data for managers in `loadAll`**

Inside the `if (profile?.role === 'manager')` block in `loadAll` (after the existing `homeworkRows`/`sessionRows` reassignment), add a parallel fetch scoped to `studentIds` and merge the results into the returned state. Modify the block to:

```typescript
  let examRecords: ExamRecord[] = [];
  let examSubjects: ExamSubject[] = [];
  let examSubjectRanges: ExamSubjectRange[] = [];
  let tutoringSchedules: TutoringSchedule[] = [];
  let tutoringScheduleExceptions: TutoringScheduleException[] = [];
  let studentLabels: Record<string, string> = {};

  if (profile?.role === 'manager') {
    managedStudents = await fetchManagedStudents(userId);
    studentLabels = await fetchStudentLabels(userId);
    const studentIds = managedStudents.map((s) => s.id);
    if (studentIds.length > 0) {
      const [managerHomeworkRes, managerSessionsRes, examRes, scheduleRes, exceptionRes] = await Promise.all([
        supabase.from('sb_homework_assignments').select('*').in('student_id', studentIds),
        supabase.from('sb_study_sessions').select('*').in('user_id', studentIds),
        supabase.from('sb_exam_records').select('*').in('student_id', studentIds),
        supabase.from('sb_tutoring_schedules').select('*').eq('manager_id', userId),
        supabase.from('sb_tutoring_schedule_exceptions').select('*').eq('manager_id', userId),
      ]);
      homeworkRows = managerHomeworkRes.data ?? [];
      sessionRows = managerSessionsRes.data ?? [];
      examRecords = (examRes.data ?? []).map(examRecordFromRow);
      tutoringSchedules = (scheduleRes.data ?? []).map(tutoringScheduleFromRow);
      tutoringScheduleExceptions = (exceptionRes.data ?? []).map(tutoringScheduleExceptionFromRow);

      const examIds = examRecords.map((e) => e.id);
      if (examIds.length > 0) {
        const subjectsRes = await supabase.from('sb_exam_subjects').select('*').in('exam_id', examIds);
        examSubjects = (subjectsRes.data ?? []).map(examSubjectFromRow);
        const subjectIds = examSubjects.map((s) => s.id);
        if (subjectIds.length > 0) {
          const rangesRes = await supabase.from('sb_exam_subject_ranges').select('*').in('exam_subject_id', subjectIds);
          examSubjectRanges = (rangesRes.data ?? []).map(examSubjectRangeFromRow);
        }
      }
    } else {
      homeworkRows = [];
      sessionRows = [];
    }
  }
```

(This replaces the existing smaller `if (studentIds.length > 0) { ... } else { ... }` block — keep the existing `homeworkRows`/`sessionRows` assignments, just add the new fetches alongside them.)

Add a `fetchStudentLabels` helper next to the existing `fetchManagedStudents` function (same file, above `loadAll`):

```typescript
// 관리자가 자기 화면에서만 보는 학생 별칭. sb_student_manager_links.label에서 읽는다(0007 마이그레이션).
async function fetchStudentLabels(managerId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from('sb_student_manager_links').select('student_id, label').eq('manager_id', managerId);
  const labels: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.label) labels[row.student_id] = row.label;
  }
  return labels;
}
```

Add the six new fields to the object `loadAll` returns (alongside `managedStudents`):

```typescript
    examRecords,
    examSubjects,
    examSubjectRanges,
    tutoringSchedules,
    tutoringScheduleExceptions,
    studentLabels,
    studentPlannerItems: {},
```

- [ ] **Step 3: Add the new actions**

Add to the `AppStateActions` interface:

```typescript
  updateStudentLabel: (studentId: string, label: string) => Promise<void>;
  createExamRecord: (studentId: string, exam: { title: string; examDate: string; isMain: boolean }) => Promise<string>;
  addExamSubject: (examId: string, subject: { subjectId: SubjectId; targetGrade: string; targetScore: string; targetRank: string }) => Promise<void>;
  registerHomeworkRange: (
    studentId: string,
    examSubjectId: string,
    params: { subjectId: SubjectId; material: string; startPage: number; endPage: number; selectedDates: DateKey[] }
  ) => Promise<void>;
  upsertTutoringSchedule: (studentId: string, weekdays: number[]) => Promise<void>;
  addTutoringException: (studentId: string, exception: { originalDate: DateKey; newDate: DateKey | null; note: string }) => Promise<void>;
  loadStudentPlannerItems: (studentId: string) => Promise<void>;
```

Add `SubjectId` to the existing type import from `../types` if not already present (it already is, via `PlannerItem`'s dependency — verify by checking the current import list; add explicitly if missing).

Implement each action inside the `actions` object (after `dismissError`, before the closing `}),` of `React.useMemo`):

```typescript
      async updateStudentLabel(studentId, label) {
        setState((s) => ({ ...s, studentLabels: { ...s.studentLabels, [studentId]: label } }));
        const { error } = await supabase
          .from('sb_student_manager_links')
          .update({ label })
          .eq('student_id', studentId)
          .eq('manager_id', userId);
        if (error) {
          console.error('updateStudentLabel failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async createExamRecord(studentId, exam) {
        const id = uid();
        const createdAt = new Date().toISOString();
        const fullExam: ExamRecord = { id, studentId, createdBy: userId, title: exam.title, examDate: exam.examDate, isMain: exam.isMain, createdAt };
        setState((s) => ({ ...s, examRecords: [...s.examRecords, fullExam] }));

        const { error } = await supabase.from('sb_exam_records').insert({
          id,
          student_id: studentId,
          created_by: userId,
          title: exam.title,
          exam_date: exam.examDate,
          is_main: exam.isMain,
        });
        if (error) {
          console.error('createExamRecord failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
        return id;
      },

      async addExamSubject(examId, subject) {
        const id = uid();
        const createdAt = new Date().toISOString();
        const fullSubject: ExamSubject = { id, examId, ...subject, createdAt };
        setState((s) => ({ ...s, examSubjects: [...s.examSubjects, fullSubject] }));

        const { error } = await supabase.from('sb_exam_subjects').insert({
          id,
          exam_id: examId,
          subject_id: subject.subjectId,
          target_grade: subject.targetGrade,
          target_score: subject.targetScore,
          target_rank: subject.targetRank,
        });
        if (error) {
          console.error('addExamSubject failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async registerHomeworkRange(studentId, examSubjectId, params) {
        const distribution = splitPagesAcrossDates(params.startPage, params.endPage, params.selectedDates);
        const rangeLabel = `${params.startPage}~${params.endPage}페이지`;
        const rangeId = uid();
        const createdAt = new Date().toISOString();
        const fullRange: ExamSubjectRange = {
          id: rangeId,
          examSubjectId,
          material: params.material,
          rangeLabel,
          assignedDates: params.selectedDates,
          createdAt,
        };
        setState((s) => ({ ...s, examSubjectRanges: [...s.examSubjectRanges, fullRange] }));

        const { error: rangeError } = await supabase.from('sb_exam_subject_ranges').insert({
          id: rangeId,
          exam_subject_id: examSubjectId,
          material: params.material,
          range_label: rangeLabel,
          assigned_dates: params.selectedDates,
        });
        if (rangeError) {
          console.error('registerHomeworkRange (range) failed:', rangeError.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
          return;
        }

        // 학생 계정 이름으로 각 날짜에 숙제 항목을 즉시 생성한다(지연 생성 없음). 학생의 plannerItems가
        // 아니라 studentPlannerItems[studentId]에 낙관적으로 반영한다 — 관리자는 자기 자신의
        // plannerItems를 갖지 않는다.
        const newItems = distribution.map(({ date, pageRange }) => ({
          id: uid(),
          date,
          order: 1,
          subjectId: params.subjectId,
          startTime: '09:00',
          studyType: null as const,
          material: params.material,
          unit: '',
          pageRange,
          endTime: null,
          difficulty: null,
          restPattern: null,
          mustDo: false,
          status: 'planned' as const,
          actualMinutes: null,
          understanding: null,
          partialReason: null,
          incompleteReason: null,
          source: 'homework' as const,
          homeworkAssignmentId: null,
        }));

        setState((s) => {
          const existing = s.studentPlannerItems[studentId] ?? {};
          const merged = { ...existing };
          for (const item of newItems) {
            const list = merged[item.date] ?? [];
            const order = list.length === 0 ? 1 : Math.max(...list.map((i) => i.order)) + 1;
            merged[item.date] = [...list, { ...item, order }];
          }
          return { ...s, studentPlannerItems: { ...s.studentPlannerItems, [studentId]: merged } };
        });

        const { error: itemsError } = await supabase.from('sb_planner_items').insert(
          newItems.map((it) => ({
            id: it.id,
            user_id: studentId,
            date: it.date,
            order: it.order,
            subject_id: it.subjectId,
            start_time: it.startTime,
            study_type: it.studyType,
            material: it.material,
            unit: it.unit,
            page_range: it.pageRange,
            end_time: it.endTime,
            difficulty: it.difficulty,
            rest_pattern: it.restPattern,
            must_do: it.mustDo,
            status: it.status,
            actual_minutes: it.actualMinutes,
            understanding: it.understanding,
            partial_reason: it.partialReason,
            incomplete_reason: it.incompleteReason,
            source: it.source,
            homework_assignment_id: it.homeworkAssignmentId,
          }))
        );
        if (itemsError) {
          console.error('registerHomeworkRange (items) failed:', itemsError.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async upsertTutoringSchedule(studentId, weekdays) {
        setState((s) => {
          const exists = s.tutoringSchedules.some((sch) => sch.studentId === studentId && sch.managerId === userId);
          const updated = exists
            ? s.tutoringSchedules.map((sch) =>
                sch.studentId === studentId && sch.managerId === userId ? { ...sch, weekdays, updatedAt: new Date().toISOString() } : sch
              )
            : [...s.tutoringSchedules, { id: uid(), studentId, managerId: userId, weekdays, updatedAt: new Date().toISOString() }];
          return { ...s, tutoringSchedules: updated };
        });

        const { error } = await supabase
          .from('sb_tutoring_schedules')
          .upsert({ student_id: studentId, manager_id: userId, weekdays }, { onConflict: 'student_id,manager_id' });
        if (error) {
          console.error('upsertTutoringSchedule failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

      async addTutoringException(studentId, exception) {
        const id = uid();
        const createdAt = new Date().toISOString();
        const fullException: TutoringScheduleException = { id, studentId, managerId: userId, ...exception, createdAt };
        setState((s) => ({ ...s, tutoringScheduleExceptions: [...s.tutoringScheduleExceptions, fullException] }));

        const { error } = await supabase.from('sb_tutoring_schedule_exceptions').insert({
          id,
          student_id: studentId,
          manager_id: userId,
          original_date: exception.originalDate,
          new_date: exception.newDate,
          note: exception.note,
        });
        if (error) {
          console.error('addTutoringException failed:', error.message);
          setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
        }
      },

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

Note: `registerHomeworkRange` writes an optimistic merge into `studentPlannerItems` using the outer `setState` functional form directly (deriving from `s`, not the outer `state` closure) — it does not need the `plannerItemsRef`-style mirror that `addPlannerItem` uses, because it computes all new items' `order` values from a single `setState` call rather than several sequential calls in the same tick.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: clean. If `SubjectId` or any new type isn't imported, fix the import list at the top of the file.

- [ ] **Step 5: Run the test suite (no new tests in this task, confirm no regression)**

Run: `npx vitest run`
Expected: all existing tests still pass (66 from Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/state/AppStateContext.tsx
git commit -m "feat: add exam tracking and tutoring schedule state/actions to AppStateContext"
```

---

### Task 6: Student selector component with editable label

**Files:**
- Create: `src/screens/manager/StudentSelector.tsx`

**Interfaces:**
- Consumes: `state.managedStudents: Profile[]`, `state.studentLabels: Record<string, string>`, `actions.updateStudentLabel` (all from Task 5).
- Produces: `export default function StudentSelector({ selectedStudentId, onSelectStudent }: { selectedStudentId: string | null; onSelectStudent: (studentId: string) => void }): JSX.Element`

- [ ] **Step 1: Create the component**

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { Icon } from '../../primitives';

export default function StudentSelector({
  selectedStudentId,
  onSelectStudent,
}: {
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string) => void;
}) {
  const { state, actions } = useAppState();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  const labelFor = (studentId: string, index: number) => state.studentLabels[studentId] ?? `학생 ${index + 1}`;

  const startEdit = (studentId: string, index: number) => {
    setEditingId(studentId);
    setDraft(labelFor(studentId, index));
  };

  const commitEdit = () => {
    if (editingId && draft.trim()) actions.updateStudentLabel(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className="flex gap-2 overflow-x-auto px-5 pt-3 pb-2">
      {state.managedStudents.map((student, index) => {
        const isActive = student.id === selectedStudentId;
        const isEditing = editingId === student.id;
        if (isEditing) {
          return (
            <input
              key={student.id}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
              className="rounded-full bg-surface-container px-3 py-1.5 text-xs font-semibold outline-none ring-2 ring-primary"
            />
          );
        }
        return (
          <button
            key={student.id}
            onClick={() => onSelectStudent(student.id)}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
              isActive ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {labelFor(student.id, index)}
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                startEdit(student.id, index);
              }}
              className="ml-0.5 opacity-70"
            >
              <Icon name="edit" className="!text-[14px]" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/screens/manager/StudentSelector.tsx
git commit -m "feat: add student selector with per-manager editable label"
```

---

### Task 7: Manager Home tab — today's homework and self-planned checklist

**Files:**
- Create: `src/screens/manager/ManagerHome.tsx`

**Interfaces:**
- Consumes: `state.studentPlannerItems` (Task 5), `actions.loadStudentPlannerItems` (Task 5), `todayKey` (`src/lib.ts`), `getSubject` (`src/constants.ts`).
- Produces: `export default function ManagerHomeScreen({ studentId }: { studentId: string }): JSX.Element`

- [ ] **Step 1: Create the component**

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { getSubject } from '../../constants';
import { Card, Icon } from '../../primitives';

export default function ManagerHomeScreen({ studentId }: { studentId: string }) {
  const { state, actions } = useAppState();
  const today = todayKey();

  React.useEffect(() => {
    actions.loadStudentPlannerItems(studentId);
    // studentId 바뀔 때만 다시 불러온다 — actions는 매 렌더 재생성되므로 deps에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const items = (state.studentPlannerItems[studentId]?.[today] ?? []).slice().sort((a, b) => a.order - b.order);
  const homeworkItems = items.filter((it) => it.source === 'homework');
  const selfItems = items.filter((it) => it.source === 'self');

  const renderItem = (item: (typeof items)[number]) => (
    <Card key={item.id} className="flex items-center justify-between mb-2">
      <div>
        <p className="text-sm font-bold">{getSubject(item.subjectId).label}</p>
        <p className="text-xs text-on-surface-variant">{item.material || item.pageRange || '할 일'}</p>
      </div>
      <div
        className={`w-7 h-7 rounded-md border-2 flex items-center justify-center ${
          item.status === 'completed' ? 'bg-primary border-primary' : 'border-outline-variant'
        }`}
      >
        {item.status === 'completed' && <Icon name="check" className="!text-[18px] text-on-primary" />}
      </div>
    </Card>
  );

  return (
    <div className="px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <h2 className="text-base font-bold mt-2 mb-2">오늘 숙제</h2>
      {homeworkItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">오늘 등록된 숙제가 없어요.</p>}
      {homeworkItems.map(renderItem)}

      <h2 className="text-base font-bold mt-6 mb-2">오늘 할 일</h2>
      {selfItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">학생이 스스로 등록한 할 일이 없어요.</p>}
      {selfItems.map(renderItem)}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/screens/manager/ManagerHome.tsx
git commit -m "feat: add manager home tab showing selected student's today checklist"
```

---

### Task 8: Manager Progress tab — exam list and subject/target registration

**Files:**
- Create: `src/screens/manager/ManagerProgress.tsx`

**Interfaces:**
- Consumes: `state.examRecords`, `state.examSubjects`, `actions.createExamRecord`, `actions.addExamSubject` (Task 5).
- Produces: `export default function ManagerProgressScreen({ studentId }: { studentId: string }): JSX.Element` — this task builds the exam-list + subject-target part; Task 9 extends the same file with material/range registration (both live in one screen file per the design's single "진도관리" tab, but are split into two tasks for review granularity — Task 9 adds new UI inside the existing file rather than creating a second file).

- [ ] **Step 1: Create the component (exam list + subject targets only, no material/range yet)**

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { SUBJECTS, getSubject } from '../../constants';
import { Card, Button, TextField, ToggleSwitch, ChipGroup, SectionTitle } from '../../primitives';
import type { SubjectId } from '../../types';

export default function ManagerProgressScreen({ studentId }: { studentId: string }) {
  const { state, actions } = useAppState();
  const [showExamForm, setShowExamForm] = React.useState(false);
  const [examTitle, setExamTitle] = React.useState('');
  const [examDate, setExamDate] = React.useState(todayKey());
  const [examIsMain, setExamIsMain] = React.useState(false);
  const [selectedExamId, setSelectedExamId] = React.useState<string | null>(null);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [targetGrade, setTargetGrade] = React.useState('');
  const [targetScore, setTargetScore] = React.useState('');
  const [targetRank, setTargetRank] = React.useState('');

  const studentExams = state.examRecords.filter((e) => e.studentId === studentId);
  const selectedExam = studentExams.find((e) => e.id === selectedExamId) ?? null;
  const subjectsForExam = state.examSubjects.filter((s) => s.examId === selectedExamId);

  const submitExam = async () => {
    if (!examTitle.trim()) return;
    const id = await actions.createExamRecord(studentId, { title: examTitle, examDate, isMain: examIsMain });
    setExamTitle('');
    setExamIsMain(false);
    setShowExamForm(false);
    setSelectedExamId(id);
  };

  const submitSubject = () => {
    if (!selectedExamId || !targetGrade.trim()) return;
    actions.addExamSubject(selectedExamId, { subjectId, targetGrade, targetScore, targetRank });
    setTargetGrade('');
    setTargetScore('');
    setTargetRank('');
  };

  return (
    <div className="px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <SectionTitle
        action={
          <button onClick={() => setShowExamForm((s) => !s)} className="text-primary text-xs font-semibold">
            + 시험 추가
          </button>
        }
      >
        시험/평가
      </SectionTitle>

      {showExamForm && (
        <Card className="mb-4 space-y-3">
          <TextField label="시험명" value={examTitle} onChange={setExamTitle} placeholder="예: 2학기 중간고사" />
          <TextField label="시험일" type="date" value={examDate} onChange={setExamDate} />
          <ToggleSwitch label="메인 시험으로 지정" checked={examIsMain} onChange={setExamIsMain} />
          <Button className="w-full" onClick={submitExam}>
            추가하기
          </Button>
        </Card>
      )}

      <div className="flex gap-2 overflow-x-auto mb-4">
        {studentExams.length === 0 && <p className="text-sm text-on-surface-variant py-2">등록된 시험이 없어요.</p>}
        {studentExams.map((exam) => (
          <button
            key={exam.id}
            onClick={() => setSelectedExamId(exam.id)}
            className={`shrink-0 rounded-xl px-4 py-3 text-left ${
              exam.id === selectedExamId ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest shadow-card'
            }`}
          >
            <p className="text-sm font-bold">
              {exam.title} {exam.isMain && '⭐'}
            </p>
            <p className="text-xs opacity-80">{exam.examDate}</p>
          </button>
        ))}
      </div>

      {selectedExam && (
        <>
          <SectionTitle>과목별 목표</SectionTitle>
          <Card className="mb-4 space-y-3">
            <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
            <div className="grid grid-cols-3 gap-2">
              <TextField label="목표 등급" value={targetGrade} onChange={setTargetGrade} placeholder="1등급" />
              <TextField label="목표 점수" value={targetScore} onChange={setTargetScore} placeholder="90점" />
              <TextField label="목표 등수" value={targetRank} onChange={setTargetRank} placeholder="반 3등" />
            </div>
            <Button className="w-full" onClick={submitSubject}>
              과목 추가
            </Button>
          </Card>

          <div className="space-y-2">
            {subjectsForExam.map((subject) => (
              <Card key={subject.id}>
                <p className="text-sm font-bold">{getSubject(subject.subjectId).label}</p>
                <p className="text-xs text-on-surface-variant">
                  {subject.targetGrade} · {subject.targetScore} · {subject.targetRank}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/screens/manager/ManagerProgress.tsx
git commit -m "feat: add manager progress tab with exam list and subject target registration"
```

---

### Task 9: Manager Progress tab — material/range registration with mini-calendar day picker

**Files:**
- Modify: `src/screens/manager/ManagerProgress.tsx`

**Interfaces:**
- Consumes: `state.examSubjectRanges`, `actions.registerHomeworkRange` (Task 5), `state.tutoringSchedules` (Task 5), `getTutoringDaysInRange` (Task 4), `addDaysToKey` (`src/lib.ts`).
- Produces: extends `ManagerProgressScreen` with a per-subject "교재 등록" flow.

- [ ] **Step 1: Add the material/range registration UI**

Add new imports to `ManagerProgress.tsx`: `getTutoringDaysInRange, addDaysToKey` from `../../lib`.

Add new state (inside the component, alongside existing `useState` calls):

```tsx
  const [rangeSubjectId, setRangeSubjectId] = React.useState<string | null>(null); // which ExamSubject is registering a range
  const [material, setMaterial] = React.useState('');
  const [startPage, setStartPage] = React.useState('');
  const [endPage, setEndPage] = React.useState('');
  const [selectedDates, setSelectedDates] = React.useState<string[]>([]);
```

Add a computed tutoring-day set for the mini-calendar (14-day lookahead from today):

```tsx
  const schedule = state.tutoringSchedules.find((sch) => sch.studentId === studentId);
  const scheduleExceptions = state.tutoringScheduleExceptions.filter((ex) => ex.studentId === studentId);
  const rangeStart = todayKey();
  const rangeEnd = addDaysToKey(rangeStart, 13);
  const tutoringDays = new Set(getTutoringDaysInRange(schedule?.weekdays ?? [], scheduleExceptions, rangeStart, rangeEnd));
  const miniCalendarDates = React.useMemo(() => {
    const dates: string[] = [];
    let cursor = rangeStart;
    for (let i = 0; i < 14; i++) {
      dates.push(cursor);
      cursor = addDaysToKey(cursor, 1);
    }
    return dates;
  }, [rangeStart]);

  const toggleDate = (date: string) => {
    setSelectedDates((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]));
  };

  const submitRange = () => {
    if (!rangeSubjectId || !material.trim() || !startPage.trim() || !endPage.trim() || selectedDates.length === 0) return;
    const subject = subjectsForExam.find((s) => s.id === rangeSubjectId);
    if (!subject) return;
    actions.registerHomeworkRange(studentId, rangeSubjectId, {
      subjectId: subject.subjectId,
      material,
      startPage: Number(startPage),
      endPage: Number(endPage),
      selectedDates,
    });
    setMaterial('');
    setStartPage('');
    setEndPage('');
    setSelectedDates([]);
    setRangeSubjectId(null);
  };
```

Replace the subject card rendering inside the `{subjectsForExam.map(...)}` block (from Task 8) to add a "교재 등록" toggle button and, when open, the mini-calendar + range history:

```tsx
            {subjectsForExam.map((subject) => {
              const ranges = state.examSubjectRanges.filter((r) => r.examSubjectId === subject.id);
              const isRegistering = rangeSubjectId === subject.id;
              return (
                <Card key={subject.id} className="mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">{getSubject(subject.subjectId).label}</p>
                      <p className="text-xs text-on-surface-variant">
                        {subject.targetGrade} · {subject.targetScore} · {subject.targetRank}
                      </p>
                    </div>
                    <button
                      onClick={() => setRangeSubjectId(isRegistering ? null : subject.id)}
                      className="text-xs font-semibold text-primary"
                    >
                      교재 등록
                    </button>
                  </div>

                  {isRegistering && (
                    <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-3">
                      <TextField label="교재명" value={material} onChange={setMaterial} placeholder="예: 쎈 수학 (상)" />
                      <div className="grid grid-cols-2 gap-2">
                        <TextField label="시작 페이지" type="number" value={startPage} onChange={setStartPage} placeholder="10" />
                        <TextField label="끝 페이지" type="number" value={endPage} onChange={setEndPage} placeholder="50" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">공부할 날짜 선택</label>
                        <div className="grid grid-cols-7 gap-1.5">
                          {miniCalendarDates.map((date) => {
                            const isTutoringDay = tutoringDays.has(date);
                            const isSelected = selectedDates.includes(date);
                            const day = Number(date.split('-')[2]);
                            return (
                              <button
                                key={date}
                                onClick={() => toggleDate(date)}
                                className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center ${
                                  isSelected
                                    ? 'bg-primary text-on-primary'
                                    : isTutoringDay
                                      ? 'bg-tertiary-container/40 text-on-surface'
                                      : 'bg-surface-container text-on-surface-variant'
                                }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-on-surface-variant mt-1">진한 표시 칸 = 과외 날짜</p>
                      </div>
                      <Button className="w-full" onClick={submitRange}>
                        {selectedDates.length}일에 나눠서 등록
                      </Button>
                    </div>
                  )}

                  {ranges.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-1.5">
                      {ranges.map((r) => (
                        <p key={r.id} className="text-xs text-on-surface-variant">
                          {r.material} · {r.rangeLabel} · {r.assignedDates.join(', ')}
                        </p>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
```

(This replaces the plain `<Card key={subject.id}>...</Card>` rendering from Task 8's step 1 — the `{subjectsForExam.map((subject) => (<Card ...))}` block is fully replaced by the version above.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Manual verification (no automated test harness for screens in this project)**

Run the dev server, register a mock exam + subject + material range for a linked student, and confirm:
- Mini-calendar shows 14 days starting today, with tutoring days visually distinct.
- Tapping dates toggles selection.
- Submitting creates the expected number of `sb_planner_items` rows (verify via Supabase Table Editor) with a correctly split page range per date.

- [ ] **Step 4: Commit**

```bash
git add src/screens/manager/ManagerProgress.tsx
git commit -m "feat: add material/range registration with mini-calendar day picker to progress tab"
```

---

### Task 10: Manager Calendar tab — month grid with per-day checklist and tutoring-day markers

**Files:**
- Create: `src/screens/manager/ManagerCalendar.tsx`

**Interfaces:**
- Consumes: `monthGrid`, `addMonthsToKey`, `todayKey`, `getTutoringDaysInRange` (`src/lib.ts`), `state.studentPlannerItems`, `actions.loadStudentPlannerItems`, `state.tutoringSchedules`, `state.tutoringScheduleExceptions` (Task 5), `getSubject` (`src/constants.ts`).
- Produces: `export default function ManagerCalendarScreen({ studentId }: { studentId: string }): JSX.Element`

- [ ] **Step 1: Create the component**

This borrows the month-grid visual pattern from `src/screens/Calendar.tsx` (`monthGrid`, weekday header, day-circle rendering) but shows planner-item completion + tutoring days instead of schedule-block editing.

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, monthGrid, addMonthsToKey, getTutoringDaysInRange } from '../../lib';
import { getSubject } from '../../constants';
import { Card, Icon } from '../../primitives';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export default function ManagerCalendarScreen({ studentId }: { studentId: string }) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [viewMonthKey, setViewMonthKey] = React.useState(today);

  React.useEffect(() => {
    actions.loadStudentPlannerItems(studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const grid = monthGrid(viewMonthKey);
  const schedule = state.tutoringSchedules.find((sch) => sch.studentId === studentId);
  const scheduleExceptions = state.tutoringScheduleExceptions.filter((ex) => ex.studentId === studentId);
  const tutoringDays = new Set(
    getTutoringDaysInRange(schedule?.weekdays ?? [], scheduleExceptions, grid[0].key, grid[grid.length - 1].key)
  );

  const itemsByDate = state.studentPlannerItems[studentId] ?? {};
  const selectedItems = (itemsByDate[selectedDate] ?? []).slice().sort((a, b) => a.order - b.order);

  const [viewY, viewM] = viewMonthKey.split('-');
  const [selY, selM, selD] = selectedDate.split('-');

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between mt-2 mb-3">
        <button onClick={() => setViewMonthKey(addMonthsToKey(viewMonthKey, -1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="chevron_left" />
        </button>
        <p className="text-base font-bold">
          {viewY}년 {Number(viewM)}월
        </p>
        <button onClick={() => setViewMonthKey(addMonthsToKey(viewMonthKey, 1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="chevron_right" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[11px] text-on-surface-variant py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 mb-5">
        {grid.map((d) => {
          const isSelected = d.key === selectedDate;
          const isToday = d.key === today;
          const isTutoringDay = tutoringDays.has(d.key);
          const dayItems = itemsByDate[d.key] ?? [];
          const hasItems = dayItems.length > 0;
          return (
            <button key={d.key} onClick={() => setSelectedDate(d.key)} className="flex flex-col items-center py-1.5">
              <span
                className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                  isSelected
                    ? 'bg-primary text-on-primary font-bold'
                    : isTutoringDay
                      ? 'bg-tertiary-container/40 text-on-surface'
                      : isToday
                        ? 'border border-primary text-primary font-semibold'
                        : d.inCurrentMonth
                          ? 'text-on-surface'
                          : 'text-outline-variant'
                }`}
              >
                {d.date}
              </span>
              <span className={`w-1 h-1 rounded-full mt-0.5 ${hasItems ? 'bg-secondary' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-primary mb-3">
        {selY}년 {Number(selM)}월 {Number(selD)}일{selectedDate === today ? ' (오늘)' : ''}
        {tutoringDays.has(selectedDate) ? ' · 과외 날' : ''}
      </p>

      <div className="space-y-2">
        {selectedItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">이 날 계획된 항목이 없어요.</p>}
        {selectedItems.map((item) => (
          <Card key={item.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">
                {getSubject(item.subjectId).label} {item.source === 'homework' && <span className="text-[10px] text-tertiary ml-1">숙제</span>}
              </p>
              <p className="text-xs text-on-surface-variant">{item.material || item.pageRange || '할 일'}</p>
            </div>
            <div
              className={`w-7 h-7 rounded-md border-2 flex items-center justify-center ${
                item.status === 'completed' ? 'bg-primary border-primary' : 'border-outline-variant'
              }`}
            >
              {item.status === 'completed' && <Icon name="check" className="!text-[18px] text-on-primary" />}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/screens/manager/ManagerCalendar.tsx
git commit -m "feat: add manager calendar tab with month grid, tutoring days, and per-day checklist"
```

---

### Task 11: Manager Calendar tab — tutoring exception editing and small schedule-pattern editor

**Files:**
- Modify: `src/screens/manager/ManagerCalendar.tsx`

**Interfaces:**
- Consumes: `actions.addTutoringException`, `actions.upsertTutoringSchedule` (Task 5).
- Produces: extends `ManagerCalendarScreen` with a tap-to-edit exception flow and a small schedule-pattern editor.

- [ ] **Step 1: Add a tutoring-day tap handler and exception bottom sheet**

Add imports: `BottomSheet, Button, TextField, ChipGroup` from `../../primitives`.

Add state:

```tsx
  const [exceptionSheetOpen, setExceptionSheetOpen] = React.useState(false);
  const [exceptionAction, setExceptionAction] = React.useState<'cancel' | 'move'>('cancel');
  const [exceptionNewDate, setExceptionNewDate] = React.useState(today);
  const [scheduleSheetOpen, setScheduleSheetOpen] = React.useState(false);
  const [draftWeekdays, setDraftWeekdays] = React.useState<number[]>(schedule?.weekdays ?? []);
```

Add a small "과외 요일 설정" trigger below the calendar header (insert right after the month-nav `<div className="flex items-center justify-between ...">` block, before the weekday header grid):

```tsx
      <div className="flex justify-end mb-2">
        <button
          onClick={() => {
            setDraftWeekdays(schedule?.weekdays ?? []);
            setScheduleSheetOpen(true);
          }}
          className="text-[11px] text-on-surface-variant underline"
        >
          과외 요일 설정
        </button>
      </div>
```

Add an exception trigger to the selected-date summary line — replace the existing `<p className="text-xs font-semibold text-primary mb-3">...</p>` block with:

```tsx
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-primary">
          {selY}년 {Number(selM)}월 {Number(selD)}일{selectedDate === today ? ' (오늘)' : ''}
          {tutoringDays.has(selectedDate) ? ' · 과외 날' : ''}
        </p>
        {tutoringDays.has(selectedDate) && (
          <button
            onClick={() => {
              setExceptionAction('cancel');
              setExceptionNewDate(selectedDate);
              setExceptionSheetOpen(true);
            }}
            className="text-[11px] text-error font-semibold"
          >
            이 날 일정 변경
          </button>
        )}
      </div>
```

Add the two bottom sheets at the end of the component's returned JSX (just before the final closing `</div>`):

```tsx
      <BottomSheet open={exceptionSheetOpen} onClose={() => setExceptionSheetOpen(false)} title="과외 일정 변경">
        <div className="space-y-3">
          <ChipGroup
            options={[
              { id: 'cancel', label: '이번만 취소' },
              { id: 'move', label: '다른 날로 변경' },
            ]}
            value={exceptionAction}
            onChange={setExceptionAction}
          />
          {exceptionAction === 'move' && (
            <TextField label="변경할 날짜" type="date" value={exceptionNewDate} onChange={setExceptionNewDate} />
          )}
          <Button
            className="w-full"
            onClick={() => {
              actions.addTutoringException(studentId, {
                originalDate: selectedDate,
                newDate: exceptionAction === 'cancel' ? null : exceptionNewDate,
                note: '',
              });
              setExceptionSheetOpen(false);
            }}
          >
            적용하기
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={scheduleSheetOpen} onClose={() => setScheduleSheetOpen(false)} title="과외 요일 설정">
        <div className="space-y-3">
          <ChipGroup
            multi
            options={[
              { id: '0', label: '일' },
              { id: '1', label: '월' },
              { id: '2', label: '화' },
              { id: '3', label: '수' },
              { id: '4', label: '목' },
              { id: '5', label: '금' },
              { id: '6', label: '토' },
            ]}
            value={draftWeekdays.map(String)}
            onChange={(ids: string[]) => setDraftWeekdays(ids.map(Number))}
          />
          <Button
            className="w-full"
            onClick={() => {
              actions.upsertTutoringSchedule(studentId, draftWeekdays);
              setScheduleSheetOpen(false);
            }}
          >
            저장
          </Button>
        </div>
      </BottomSheet>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean. If `ChipGroup`'s `onChange` typing (`(value: any) => void`) causes a mismatch with the `multi` usage above, cast at the call site (`onChange={(ids) => setDraftWeekdays((ids as string[]).map(Number))}`) rather than changing `ChipGroup`'s shared type.

- [ ] **Step 3: Manual verification**

Run the dev server: set a tutoring schedule (e.g., Fri+Sat), confirm those days highlight on the calendar; tap a tutoring day and cancel it, confirm the highlight disappears; tap another and move it, confirm the original day loses its highlight and the new date gains it.

- [ ] **Step 4: Commit**

```bash
git add src/screens/manager/ManagerCalendar.tsx
git commit -m "feat: add tutoring exception editing and schedule-pattern editor to calendar tab"
```

---

### Task 12: Wire the new manager shell into App.tsx, remove ManagerHomeworkForm

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/screens/manager/ManagerHomeworkForm.tsx`

**Interfaces:**
- Consumes: `StudentSelector` (Task 6), `ManagerHomeScreen` (Task 7), `ManagerProgressScreen` (Tasks 8-9), `ManagerCalendarScreen` (Tasks 10-11), `ManagerStudentListScreen` (existing, unchanged).

- [ ] **Step 1: Delete the old homework form**

```bash
git rm src/screens/manager/ManagerHomeworkForm.tsx
```

- [ ] **Step 2: Replace `ManagerAppShell` in `App.tsx`**

Remove the import `import ManagerHomeworkFormScreen from './screens/manager/ManagerHomeworkForm';` and add:

```typescript
import StudentSelector from './screens/manager/StudentSelector';
import ManagerHomeScreen from './screens/manager/ManagerHome';
import ManagerProgressScreen from './screens/manager/ManagerProgress';
import ManagerCalendarScreen from './screens/manager/ManagerCalendar';
```

Add a manager tab constant near the top of the file (or import from `constants.ts` — keep it local here since it's manager-specific and small, following the file's existing pattern of defining `Overlay` locally rather than always centralizing):

```typescript
const MANAGER_TABS = [
  { id: 'calendar', label: '캘린더', icon: 'calendar_today' },
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'progress', label: '진도관리', icon: 'trending_up' },
] as const;
```

Replace the entire `ManagerAppShell` function with:

```tsx
function ManagerAppShell() {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<(typeof MANAGER_TABS)[number]['id']>('home');

  if (!selectedStudentId) {
    return (
      <div id="app-shell">
        <ErrorBanner />
        <ManagerStudentListScreen onSelectStudent={setSelectedStudentId} />
      </div>
    );
  }

  return (
    <div id="app-shell">
      <ErrorBanner />
      <StudentSelector selectedStudentId={selectedStudentId} onSelectStudent={setSelectedStudentId} />
      {tab === 'calendar' && <ManagerCalendarScreen studentId={selectedStudentId} />}
      {tab === 'home' && <ManagerHomeScreen studentId={selectedStudentId} />}
      {tab === 'progress' && <ManagerProgressScreen studentId={selectedStudentId} />}
      <BottomNav tabs={MANAGER_TABS} active={tab} onChange={setTab} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: clean. `BottomNav`'s generic constraint (`T extends { id: string; label: string; icon: string }`) already supports this new tab shape — no changes needed there.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, no regressions (66 tests from Task 4, unchanged by this task).

- [ ] **Step 5: Manual verification**

Run the dev server as a manager account with at least one linked student:
- Confirm the student-list screen still appears first when no student is selected.
- Selecting a student shows the student-selector chip strip + bottom nav with 캘린더/홈/진도관리 (홈 in the middle).
- Switching tabs preserves the selected student.
- Confirm the legacy student app and new student 4-tab app are both unaffected (log in as a student account, verify normal operation).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire new manager shell (student selector + calendar/home/progress tabs)"
```

---

### Task 13: Final review pass

**Files:** none (review-only task)

- [ ] **Step 1: Full verification**

Run: `npx tsc -b && npx vitest run`
Expected: clean typecheck, all tests passing.

- [ ] **Step 2: Confirm no dead references to the removed screen**

Run: `grep -rn "ManagerHomeworkForm" src/` (or equivalent search)
Expected: no matches.

- [ ] **Step 3: Confirm the migration file is syntactically self-consistent**

Read through `supabase/migrations/0007_manager_progress_and_schedule.sql` once more end-to-end and confirm every `references`/`join` target table is created earlier in the same file (migrations run top-to-bottom in one transaction per Supabase's SQL editor, so forward references fail).

- [ ] **Step 4: Commit any final fixups, or confirm nothing pending**

```bash
git status --short
```

Expected: clean (nothing to commit) if Steps 1-3 found no issues.
