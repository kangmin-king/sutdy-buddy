# 학생/관리자 투트랙 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** study-buddy-web을 학생용(4탭: 홈 타이머/캘린더/스터디플래너/딴짓멈춰)과 관리자용(과외쌤·학부모, 숙제 등록 + 실행 확인)으로 분리하고, 관리자가 등록한 반복 숙제가 매일 자동으로 학생 홈에 뜨며, 학생은 열품타처럼 시작/정지/완료로 시간을 재고, 실행 중 허용 목록에 없는 앱을 열면 타이머가 자동 정지되도록 만든다.

**Architecture:** 기존 study-buddy-web(React+Supabase+Capacitor) 저장소를 그대로 확장한다. 로그인 후 `sb_profiles.role`(`student` | `manager`)에 따라 App.tsx가 완전히 다른 화면 트리를 렌더링한다. 숙제는 반복 템플릿(`sb_homework_assignments`)으로 저장하고, 클라이언트가 오늘 날짜를 조회할 때 없으면 지연 생성한다. 실행 기록은 시작~정지 조각(`sb_study_sessions`)으로 저장해 캘린더에서 타임라인으로 재구성한다. 이탈 감지는 기존 `ForegroundAppAccessibilityService`를 확장해 허용 목록 기반으로 바꾼다.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind, Supabase(Postgres/Auth), Capacitor 8(Android), Kotlin(AccessibilityService).

## Global Constraints

- 모든 신규 테이블은 `sb_` 접두사, RLS 필수 (design doc 참고).
- 기존 컨디션/AI추천/기존 체크리스트 화면·데이터는 이번 계획에서 삭제하지 않는다 — 코드/테이블 그대로 남겨두고 손대지 않는다.
- 숙제 항목은 학생이 삭제할 수 없다(시간만 기록).
- 실행 중 이탈 감지는 **강제 전환 없이 타이머만 정지** — `docs/superpowers/specs/2026-08-04-tutor-student-two-track-design.md` 참고.

---

### Task 1: DB 마이그레이션 — role, 연결, 숙제, 세션 테이블

**Files:**
- Create: `supabase/migrations/0004_two_track.sql`

**Interfaces:**
- Produces: `sb_profiles.role` 컬럼(`'student' | 'manager'`, 기본 `'student'`), `sb_profiles.invite_code`(학생 전용, unique), `sb_student_manager_links`, `sb_homework_assignments`, `sb_study_sessions` 테이블, `sb_planner_items.source` 컬럼(`'homework' | 'self'`, 기본 `'self'`)

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
alter table sb_profiles add column role text not null default 'student' check (role in ('student', 'manager'));
alter table sb_profiles add column invite_code text unique;

create table sb_student_manager_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  unique (student_id, manager_id)
);
alter table sb_student_manager_links enable row level security;
create policy "student sees own links" on sb_student_manager_links for select using (auth.uid() = student_id);
create policy "manager sees own links" on sb_student_manager_links for select using (auth.uid() = manager_id);
create policy "manager creates link" on sb_student_manager_links for insert with check (auth.uid() = manager_id);
create policy "either side deletes link" on sb_student_manager_links for delete using (auth.uid() = student_id or auth.uid() = manager_id);

create table sb_homework_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  subject_id text not null,
  material text not null default '',
  amount_per_day text not null default '',
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default now()
);
alter table sb_homework_assignments enable row level security;
create policy "student reads own homework" on sb_homework_assignments for select using (auth.uid() = student_id);
create policy "linked manager manages homework" on sb_homework_assignments for all using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_homework_assignments.student_id and l.manager_id = auth.uid())
) with check (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_homework_assignments.student_id and l.manager_id = auth.uid())
);

alter table sb_planner_items add column source text not null default 'self' check (source in ('homework', 'self'));
alter table sb_planner_items add column homework_assignment_id uuid references sb_homework_assignments(id) on delete set null;

create table sb_study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planner_item_id uuid not null references sb_planner_items(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  deviated boolean not null default false
);
alter table sb_study_sessions enable row level security;
create policy "own study sessions" on sb_study_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "linked manager reads sessions" on sb_study_sessions for select using (
  exists (select 1 from sb_student_manager_links l where l.student_id = sb_study_sessions.user_id and l.manager_id = auth.uid())
);
```

- [ ] **Step 2: 로컬에서 문법 확인 (실제 적용은 사용자가 `npx supabase db push`로 수행)**

이 환경엔 Supabase CLI가 DB에 연결되어 있지 않으므로, SQL 문법만 `cat supabase/migrations/0004_two_track.sql`로 육안 검토하고 세미콜론/괄호 짝을 확인한다. 실제 push는 사용자가 수행.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_two_track.sql
git commit -m "feat: add role, student-manager links, homework, and study-session tables"
```

---

### Task 2: 타입 + DB 매퍼 추가

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/types/db.ts`
- Modify: `src/state/mappers.ts`

**Interfaces:**
- Consumes: Task 1의 테이블 구조
- Produces: `Role`, `HomeworkAssignment`, `StudySession`, `homeworkAssignmentFromRow`, `studySessionFromRow`, `PlannerItem.source`/`homeworkAssignmentId` 필드

- [ ] **Step 1: `src/types/index.ts`에 타입 추가**

```typescript
export type Role = 'student' | 'manager';

export interface HomeworkAssignment {
  id: string;
  studentId: string;
  createdBy: string;
  subjectId: SubjectId;
  material: string;
  amountPerDay: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  updatedAt: string;
}

export interface StudySession {
  id: string;
  plannerItemId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  deviated: boolean;
}
```

그리고 `Profile` 인터페이스에 `role: Role;` 과 `inviteCode: string | null;` 필드 추가, `PlannerItem` 인터페이스에 `source: 'homework' | 'self';` 와 `homeworkAssignmentId: string | null;` 필드 추가.

- [ ] **Step 2: `src/types/db.ts`에 Row 타입 추가**

```typescript
export type SbHomeworkAssignmentRow = {
  id: string;
  student_id: string;
  created_by: string;
  subject_id: SubjectId;
  material: string;
  amount_per_day: string;
  start_date: string;
  end_date: string;
  updated_at: string;
};

export type SbStudySessionRow = {
  id: string;
  user_id: string;
  planner_item_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  deviated: boolean;
};

export type SbStudentManagerLinkRow = {
  id: string;
  student_id: string;
  manager_id: string;
  linked_at: string;
};
```

`Database.public.Tables`에 다음 3개 항목 추가 (기존 패턴대로 `Insert`는 `id`/`updated_at` 등 DB 기본값 컬럼만 `Omit`):

```typescript
sb_homework_assignments: { Row: SbHomeworkAssignmentRow; Insert: Omit<SbHomeworkAssignmentRow, 'updated_at'>; Update: Partial<SbHomeworkAssignmentRow>; Relationships: [] };
sb_study_sessions: { Row: SbStudySessionRow; Insert: SbStudySessionRow; Update: Partial<SbStudySessionRow>; Relationships: [] };
sb_student_manager_links: { Row: SbStudentManagerLinkRow; Insert: Omit<SbStudentManagerLinkRow, 'id' | 'linked_at'>; Update: never; Relationships: [] };
```

또한 `SbProfileRow`에 `role: Role;`과 `invite_code: string | null;` 추가, `SbPlannerItemRow`에 `source: 'homework' | 'self';`와 `homework_assignment_id: string | null;` 추가.

- [ ] **Step 3: `src/state/mappers.ts`에 매퍼 함수 추가**

기존 `profileFromRow`/`plannerItemFromRow` 옆에 이어서:

```typescript
export function homeworkAssignmentFromRow(row: SbHomeworkAssignmentRow): HomeworkAssignment {
  return {
    id: row.id,
    studentId: row.student_id,
    createdBy: row.created_by,
    subjectId: row.subject_id,
    material: row.material,
    amountPerDay: row.amount_per_day,
    startDate: row.start_date,
    endDate: row.end_date,
    updatedAt: row.updated_at,
  };
}

export function studySessionFromRow(row: SbStudySessionRow): StudySession {
  return {
    id: row.id,
    plannerItemId: row.planner_item_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    deviated: row.deviated,
  };
}
```

기존 `profileFromRow`에 `role: row.role, inviteCode: row.invite_code,` 추가. 기존 `plannerItemFromRow`에 `source: row.source, homeworkAssignmentId: row.homework_assignment_id,` 추가.

- [ ] **Step 4: 타입체크**

Run: `npx tsc -b`
Expected: 아직 `role`/`source`를 안 채운 다른 곳(EMPTY_STATE 등)에서 에러가 날 수 있음 — Task 6에서 해결되므로 지금은 무시하고 다음 태스크로.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/types/db.ts src/state/mappers.ts
git commit -m "feat: add types and mappers for role, homework assignments, study sessions"
```

---

### Task 3: 순수 함수 — 숙제 템플릿 → 오늘 플래너 항목 생성

**Files:**
- Modify: `src/lib.ts`
- Modify: `src/lib.test.ts`

**Interfaces:**
- Consumes: `HomeworkAssignment`(Task 2), `DateKey`
- Produces: `shouldGenerateHomeworkItem(assignment: HomeworkAssignment, date: DateKey): boolean`

- [ ] **Step 1: 실패하는 테스트 작성** (`src/lib.test.ts` 끝에 추가)

```typescript
import { shouldGenerateHomeworkItem } from './lib';
import type { HomeworkAssignment } from './types';

function homework(overrides: Partial<HomeworkAssignment>): HomeworkAssignment {
  return {
    id: 'h1', studentId: 's1', createdBy: 'm1', subjectId: 'math',
    material: '쎈 수학', amountPerDay: '10p', startDate: '2026-08-01',
    endDate: '2026-08-10', updatedAt: '2026-08-01T00:00:00Z', ...overrides,
  };
}

describe('shouldGenerateHomeworkItem', () => {
  it('is true for a date inside the assignment range', () => {
    expect(shouldGenerateHomeworkItem(homework({}), '2026-08-05')).toBe(true);
  });
  it('is true on the exact start and end dates', () => {
    expect(shouldGenerateHomeworkItem(homework({}), '2026-08-01')).toBe(true);
    expect(shouldGenerateHomeworkItem(homework({}), '2026-08-10')).toBe(true);
  });
  it('is false before the start date', () => {
    expect(shouldGenerateHomeworkItem(homework({}), '2026-07-31')).toBe(false);
  });
  it('is false after the end date', () => {
    expect(shouldGenerateHomeworkItem(homework({}), '2026-08-11')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/lib.test.ts`
Expected: FAIL — `shouldGenerateHomeworkItem is not defined`

- [ ] **Step 3: 구현** (`src/lib.ts`에 추가)

```typescript
export function shouldGenerateHomeworkItem(assignment: HomeworkAssignment, date: DateKey): boolean {
  return date >= assignment.startDate && date <= assignment.endDate;
}
```

(문자열 `"YYYY-MM-DD"` 형식은 사전순 비교가 날짜순 비교와 동일하므로 문자열 비교로 충분하다.)

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/lib.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib.ts src/lib.test.ts
git commit -m "feat: add shouldGenerateHomeworkItem for daily homework generation"
```

---

### Task 4: 순수 함수 — 세션 조각 → 하루 타임라인 블록

**Files:**
- Modify: `src/lib.ts`
- Modify: `src/lib.test.ts`

**Interfaces:**
- Consumes: `StudySession[]`(Task 2), 각 세션에 연결된 과목 라벨을 위한 `subjectLabel: string` 매핑은 호출부 책임
- Produces: `sessionsToTimelineBlocks(sessions: { session: StudySession; subjectLabel: string }[]): TimelineBlock[]`, `interface TimelineBlock { startTime: string; endTime: string; subjectLabel: string; deviated: boolean }`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
import { sessionsToTimelineBlocks } from './lib';

describe('sessionsToTimelineBlocks', () => {
  it('converts a completed session into a block with HH:MM start/end', () => {
    const blocks = sessionsToTimelineBlocks([
      { session: { id: '1', plannerItemId: 'p1', startedAt: '2026-08-04T05:00:00Z', endedAt: '2026-08-04T05:30:00Z', durationSeconds: 1800, deviated: false }, subjectLabel: '수학' },
    ]);
    expect(blocks).toEqual([{ startTime: '05:00', endTime: '05:30', subjectLabel: '수학', deviated: false }]);
  });

  it('uses "now" as the end when a session has not ended yet', () => {
    const blocks = sessionsToTimelineBlocks([
      { session: { id: '1', plannerItemId: 'p1', startedAt: '2026-08-04T05:00:00Z', endedAt: null, durationSeconds: null, deviated: false }, subjectLabel: '수학' },
    ], '2026-08-04T05:10:00Z');
    expect(blocks[0].endTime).toBe('05:10');
  });

  it('marks deviated sessions', () => {
    const blocks = sessionsToTimelineBlocks([
      { session: { id: '1', plannerItemId: 'p1', startedAt: '2026-08-04T05:00:00Z', endedAt: '2026-08-04T05:05:00Z', durationSeconds: 300, deviated: true }, subjectLabel: '영어' },
    ]);
    expect(blocks[0].deviated).toBe(true);
  });

  it('sorts blocks by start time', () => {
    const blocks = sessionsToTimelineBlocks([
      { session: { id: '2', plannerItemId: 'p2', startedAt: '2026-08-04T09:00:00Z', endedAt: '2026-08-04T09:10:00Z', durationSeconds: 600, deviated: false }, subjectLabel: '영어' },
      { session: { id: '1', plannerItemId: 'p1', startedAt: '2026-08-04T05:00:00Z', endedAt: '2026-08-04T05:10:00Z', durationSeconds: 600, deviated: false }, subjectLabel: '수학' },
    ]);
    expect(blocks.map((b) => b.subjectLabel)).toEqual(['수학', '영어']);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/lib.test.ts`
Expected: FAIL — `sessionsToTimelineBlocks is not defined`

- [ ] **Step 3: 구현**

```typescript
export interface TimelineBlock {
  startTime: string;
  endTime: string;
  subjectLabel: string;
  deviated: boolean;
}

function toHHMM(isoString: string): string {
  return isoString.slice(11, 16);
}

export function sessionsToTimelineBlocks(
  entries: { session: StudySession; subjectLabel: string }[],
  nowIso: string = new Date().toISOString()
): TimelineBlock[] {
  return entries
    .map(({ session, subjectLabel }) => ({
      startTime: toHHMM(session.startedAt),
      endTime: toHHMM(session.endedAt ?? nowIso),
      subjectLabel,
      deviated: session.deviated,
    }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
```

`StudySession`은 `./types`에서 import 추가 필요.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/lib.test.ts`
Expected: PASS (전체 스위트도 `npx vitest run`으로 회귀 확인)

- [ ] **Step 5: Commit**

```bash
git add src/lib.ts src/lib.test.ts
git commit -m "feat: add sessionsToTimelineBlocks for calendar timeline view"
```

---

### Task 5: 회원가입 — 역할 선택 + 초대코드 연결

**Files:**
- Modify: `src/screens/AuthScreen.tsx`
- Modify: `src/screens/Onboarding.tsx`

**Interfaces:**
- Consumes: `actions.saveProfile`(기존, AppStateContext), Task 2의 `Role`
- Produces: 회원가입 시 `role` 선택 UI, 온보딩 완료 시 학생은 `invite_code` 자동 생성(`crypto.randomUUID().slice(0,8)`), 관리자는 온보딩에서 코드 입력 필드로 학생과 연결

- [ ] **Step 1: `AuthScreen.tsx`에 역할 선택 추가**

회원가입 모드일 때 이메일/비밀번호 위에 역할 선택 칩 추가:

```tsx
const [role, setRole] = React.useState<'student' | 'manager'>('student');
// ...
{mode === 'signUp' && (
  <div className="flex gap-2 mb-3">
    <Chip label="학생" active={role === 'student'} onClick={() => setRole('student')} />
    <Chip label="과외쌤 · 학부모" active={role === 'manager'} onClick={() => setRole('manager')} />
  </div>
)}
```

`handleSubmit`의 `signUp` 분기에서 `supabase.auth.signUp({ email, password, options: { data: { role } } })`로 role을 user metadata에 실어 보낸다(Onboarding에서 `session.user.user_metadata.role`로 읽어 초기 프로필 생성 시 사용).

- [ ] **Step 2: `Onboarding.tsx`에서 역할별 분기**

`useAuth()`의 `session.user.user_metadata.role`을 읽어 `role` 변수로 사용. 학생이면 기존 onboarding 폼 그대로 진행하되 `saveProfile` 호출 시 `role: 'student', inviteCode: crypto.randomUUID().slice(0, 8).toUpperCase()`를 포함. 관리자면 이름만 입력받는 훨씬 짧은 폼 + "학생 초대코드 입력" 필드를 보여주고, 저장 시 `role: 'manager', inviteCode: null`로 프로필 생성 후, 입력된 코드로 `sb_profiles`에서 `invite_code` 일치하는 학생을 찾아 `sb_student_manager_links`에 upsert.

이 연결 로직은 AppStateContext에 아직 없으므로 Task 6에서 만들 `actions.linkByInviteCode(code: string)`를 호출하는 형태로 작성(Task 6과 인터페이스만 맞춰두고, Task 6 완료 전까지는 타입 에러가 나는 게 정상).

- [ ] **Step 3: Commit**

```bash
git add src/screens/AuthScreen.tsx src/screens/Onboarding.tsx
git commit -m "feat: add role selection at signup and manager invite-code linking in onboarding"
```

---

### Task 6: AppStateContext 확장 — role, 숙제, 링크, 세션

**Files:**
- Modify: `src/state/AppStateContext.tsx`

**Interfaces:**
- Consumes: Task 2의 매퍼들, Task 3의 `shouldGenerateHomeworkItem`
- Produces: `state.homeworkAssignments: HomeworkAssignment[]`, `state.studySessions: Record<plannerItemId, StudySession[]>`, `state.managedStudents: Profile[]`(관리자 전용, 연결된 학생 목록), `actions.linkByInviteCode(code)`, `actions.createHomeworkAssignment(...)`, `actions.updateHomeworkAssignment(id, patch)`, `actions.startStudySession(plannerItemId)`, `actions.endStudySession(sessionId, deviated)`

- [ ] **Step 1: `loadAll`에 신규 쿼리 추가**

기존 `Promise.all([...])`에 다음 쿼리들을 추가:

```typescript
supabase.from('sb_homework_assignments').select('*').eq('student_id', userId),
supabase.from('sb_study_sessions').select('*').eq('user_id', userId),
supabase.from('sb_student_manager_links').select('*').or(`student_id.eq.${userId},manager_id.eq.${userId}`),
```

`profile.role === 'manager'`인 경우, 연결된 학생들의 `sb_profiles`를 추가로 조회해 `managedStudents`에 채운다. `homeworkAssignments`는 오늘 날짜 기준으로 `shouldGenerateHomeworkItem`을 돌려서, 아직 오늘 `sb_planner_items`가 없는 학생 본인의 숙제 항목은 `addPlannerItem`과 같은 방식으로 insert(단, `source: 'homework'`, `homeworkAssignmentId: assignment.id` 포함) — 이 지연 생성 로직은 `loadAll` 이후 `AppStateProvider`의 `useEffect` 안에서, `profile.role === 'student'`일 때만 수행한다.

- [ ] **Step 2: 신규 액션 구현**

```typescript
async linkByInviteCode(code: string) {
  const { data: student } = await supabase.from('sb_profiles').select('id').eq('invite_code', code.toUpperCase()).maybeSingle();
  if (!student) {
    setState((s) => ({ ...s, error: '초대코드를 찾을 수 없어요. 다시 확인해주세요.' }));
    return;
  }
  const { error } = await supabase.from('sb_student_manager_links').insert({ student_id: student.id, manager_id: userId });
  if (error) {
    console.error('linkByInviteCode failed:', error.message);
    setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE }));
  }
},

async createHomeworkAssignment(studentId, assignment) {
  const id = uid();
  const { error } = await supabase.from('sb_homework_assignments').insert({
    id, student_id: studentId, created_by: userId,
    subject_id: assignment.subjectId, material: assignment.material,
    amount_per_day: assignment.amountPerDay, start_date: assignment.startDate, end_date: assignment.endDate,
  });
  if (error) { console.error('createHomeworkAssignment failed:', error.message); setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE })); return; }
  setState((s) => ({ ...s, homeworkAssignments: [...s.homeworkAssignments, { id, studentId, createdBy: userId, ...assignment, updatedAt: new Date().toISOString() }] }));
},

async startStudySession(plannerItemId) {
  const id = uid();
  const startedAt = new Date().toISOString();
  setState((s) => ({ ...s, studySessions: { ...s.studySessions, [plannerItemId]: [...(s.studySessions[plannerItemId] ?? []), { id, plannerItemId, startedAt, endedAt: null, durationSeconds: null, deviated: false }] } }));
  const { error } = await supabase.from('sb_study_sessions').insert({ id, user_id: userId, planner_item_id: plannerItemId, started_at: startedAt, ended_at: null, duration_seconds: null, deviated: false });
  if (error) { console.error('startStudySession failed:', error.message); setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE })); }
  return id;
},

async endStudySession(plannerItemId, sessionId, deviated) {
  const endedAt = new Date().toISOString();
  setState((s) => {
    const list = s.studySessions[plannerItemId] ?? [];
    const updated = list.map((sess) => sess.id === sessionId ? { ...sess, endedAt, deviated, durationSeconds: Math.round((Date.parse(endedAt) - Date.parse(sess.startedAt)) / 1000) } : sess);
    return { ...s, studySessions: { ...s.studySessions, [plannerItemId]: updated } };
  });
  const startedAtRow = (state.studySessions[plannerItemId] ?? []).find((sess) => sess.id === sessionId);
  const durationSeconds = startedAtRow ? Math.round((Date.parse(endedAt) - Date.parse(startedAtRow.startedAt)) / 1000) : null;
  const { error } = await supabase.from('sb_study_sessions').update({ ended_at: endedAt, deviated, duration_seconds: durationSeconds }).eq('id', sessionId);
  if (error) { console.error('endStudySession failed:', error.message); setState((s) => ({ ...s, error: WRITE_FAILURE_MESSAGE })); }
},
```

`startStudySession`은 반환값으로 `sessionId`를 즉시 써야 하는 호출부(정지 버튼)가 있으므로 `Promise<string>`으로 선언한다.

- [ ] **Step 3: `EMPTY_STATE`와 `AppState` 인터페이스에 새 필드 반영**

`homeworkAssignments: []`, `studySessions: {}`, `managedStudents: []`를 `EMPTY_STATE`에 추가하고 `AppState` 인터페이스에 타입 반영.

- [ ] **Step 4: 타입체크**

Run: `npx tsc -b`
Expected: PASS (Task 5에서 남겨둔 `linkByInviteCode` 호출부 에러도 여기서 해소됨)

- [ ] **Step 5: Commit**

```bash
git add src/state/AppStateContext.tsx
git commit -m "feat: load and manage homework assignments, study sessions, and student-manager links"
```

---

### Task 7: App.tsx 역할별 루트 라우팅

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `state.profile.role`(Task 6)
- Produces: `state.profile.role === 'student'`면 기존 `AppShell`(당분간 유지) 대신 신규 `StudentAppShell`, `'manager'`면 `ManagerAppShell`을 렌더링하는 분기

- [ ] **Step 1: 역할 분기 추가**

`AppShell` 함수 안, `state.loading`/`!state.profile` 체크 이후에:

```tsx
if (state.profile.role === 'manager') {
  return <ManagerAppShell />;
}
return <StudentAppShell />;
```

기존 `AppShell` 본문(현재의 5탭 UI 전체)은 이번 태스크에서 `StudentAppShell`이라는 이름으로 그대로 옮겨서 유지한다(추후 태스크에서 학생용 4탭으로 점진 교체 — Global Constraints대로 기존 화면은 지금 지우지 않는다). `ManagerAppShell`은 이 태스크에서는 빈 자리표시자가 아니라 최소 동작하는 형태로 만든다:

```tsx
function ManagerAppShell() {
  const { state } = useAppState();
  return (
    <div id="app-shell" className="px-5 pt-6">
      <h1 className="text-xl font-bold mb-4">관리 중인 학생</h1>
      {state.managedStudents.length === 0 && <p className="text-sm text-on-surface-variant">아직 연결된 학생이 없어요.</p>}
      {state.managedStudents.map((s) => (
        <div key={s.id} className="rounded-xl bg-surface-container-lowest p-4 mb-2 shadow-card">{s.goal || '학생'}</div>
      ))}
    </div>
  );
}
```

(Task 13~15에서 이 자리를 실제 숙제 등록/캘린더 화면으로 채운다.)

- [ ] **Step 2: 타입체크 + 브라우저 확인**

Run: `npx tsc -b`

브라우저에서 회원가입을 `manager`로 해보고(Task 5 UI 사용) 최소 화면이 뜨는지 확인, `student`로는 기존 화면이 그대로 뜨는지 확인.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: route to StudentAppShell or ManagerAppShell based on profile role"
```

---

### Task 8: 학생 홈 — 열품타 스타일 타이머 리스트

**Files:**
- Create: `src/screens/student/StudentHome.tsx`
- Modify: `src/App.tsx` (StudentAppShell의 홈 탭에서 사용하도록 교체)

**Interfaces:**
- Consumes: `state.plannerItems[today]`, `state.studySessions`(Task 6), `actions.startStudySession`, `actions.endStudySession`
- Produces: `export default function StudentHomeScreen(): JSX.Element`

- [ ] **Step 1: 구현**

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar, Card, Icon } from '../../primitives';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function StudentHomeScreen() {
  const { state, actions } = useAppState();
  const today = todayKey();
  const items = (state.plannerItems[today] ?? []).slice().sort((a, b) => a.order - b.order);
  const [runningSessionId, setRunningSessionId] = React.useState<Record<string, string>>({});
  const [now, setNow] = React.useState(Date.now());
  const [showTodo, setShowTodo] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleStart = async (itemId: string) => {
    const sessionId = await actions.startStudySession(itemId);
    setRunningSessionId((m) => ({ ...m, [itemId]: sessionId }));
  };
  const handleStop = (itemId: string, completed: boolean) => {
    const sessionId = runningSessionId[itemId];
    if (!sessionId) return;
    actions.endStudySession(itemId, sessionId, false);
    setRunningSessionId((m) => { const next = { ...m }; delete next[itemId]; return next; });
    if (completed) actions.updatePlannerItem(today, itemId, { status: 'completed' });
  };

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />
      <button onClick={() => setShowTodo(true)} className="mt-3 mb-4 inline-flex items-center gap-1 rounded-lg bg-tertiary-container/30 px-3 py-1.5 text-xs font-semibold text-on-surface">
        📌 오늘의 할 일
      </button>

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-10">오늘 할 일이 없어요.</p>}
        {items.map((it) => {
          const sessionId = runningSessionId[it.id];
          const session = sessionId ? (state.studySessions[it.id] ?? []).find((s) => s.id === sessionId) : null;
          const elapsed = session ? Math.floor((now - Date.parse(session.startedAt)) / 1000) : 0;
          return (
            <Card key={it.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">
                  {getSubject(it.subjectId).label} {it.source === 'homework' && <span className="text-[10px] text-tertiary ml-1">숙제</span>}
                </p>
                <p className="text-xs text-on-surface-variant">{it.material || '할 일'}</p>
                {session && <p className="text-lg font-mono font-bold text-primary mt-1">{formatElapsed(elapsed)}</p>}
              </div>
              {session ? (
                <div className="flex gap-2">
                  <button onClick={() => handleStop(it.id, false)} className="text-xs font-semibold text-on-surface-variant px-3 py-2 rounded-full bg-surface-container">정지</button>
                  <button onClick={() => handleStop(it.id, true)} className="text-xs font-semibold text-on-primary px-3 py-2 rounded-full bg-primary">완료</button>
                </div>
              ) : (
                <button onClick={() => handleStart(it.id)} className="text-xs font-semibold text-on-primary px-3 py-2 rounded-full bg-primary flex items-center gap-1">
                  <Icon name="play_arrow" className="!text-[16px]" /> 시작하기
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {showTodo && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={() => setShowTodo(false)}>
          <div className="w-full bg-[#1e2b1e] text-white rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-3">오늘의 할 일</h2>
            {items.map((it) => (
              <p key={it.id} className="text-sm py-1.5 border-b border-white/10">
                {getSubject(it.subjectId).label} — {it.material || '할 일'} {it.status === 'completed' ? '✓' : ''}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `App.tsx`의 `StudentAppShell` 홈 탭에서 사용**

기존 `activeTab === 'home' && <HomeScreen .../>` 자리를, 신규 4탭 체계로 옮기는 작업은 Task 11에서 한 번에 처리한다(BottomNav 자체를 학생용 4탭으로 바꿔야 하므로). 지금은 `StudentHomeScreen`을 export만 해두고 다음 태스크로 넘어간다.

- [ ] **Step 3: 타입체크**

Run: `npx tsc -b`

- [ ] **Step 4: Commit**

```bash
git add src/screens/student/StudentHome.tsx
git commit -m "feat: add student home screen with start/stop study timers"
```

---

### Task 9: 학생 스터디플래너 — 간단 추가 화면

**Files:**
- Create: `src/screens/student/StudentPlanner.tsx`

**Interfaces:**
- Consumes: `actions.addPlannerItem`(기존), `state.plannerItems[today]`
- Produces: `export default function StudentPlannerScreen(): JSX.Element` — Calendar의 "일정 추가" 폼과 동일한 패턴(과목 칩 + 텍스트 + 시작/종료 시간), `source: 'self'`로 추가

- [ ] **Step 1: 구현**

`src/screens/TomorrowRecommendation.tsx`의 "내일 계획" 인라인 추가 폼(과목 ChipGroup + TextField + 시작/종료 TextField + 추가하기 버튼) 패턴을 오늘 날짜용으로 그대로 재사용한다:

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { getSubject, SUBJECTS } from '../../constants';
import { TopAppBar, Card, Button, Icon, SectionTitle, ChipGroup, TextField } from '../../primitives';
import type { SubjectId } from '../../types';

export default function StudentPlannerScreen() {
  const { state, actions } = useAppState();
  const today = todayKey();
  const items = (state.plannerItems[today] ?? []).filter((i) => i.source === 'self').slice().sort((a, b) => a.order - b.order);

  const [showForm, setShowForm] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [task, setTask] = React.useState('');
  const [startTime, setStartTime] = React.useState('09:00');
  const [endTime, setEndTime] = React.useState('');

  const addTask = () => {
    if (!task.trim()) return;
    actions.addPlannerItem(today, {
      date: today, subjectId, startTime, studyType: null, material: task, unit: '', pageRange: '',
      endTime: endTime || null, difficulty: null, restPattern: null, mustDo: false, status: 'planned',
      actualMinutes: null, understanding: null, partialReason: null, incompleteReason: null,
      source: 'self', homeworkAssignmentId: null,
    });
    setTask('');
    setShowForm(false);
  };

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />
      <SectionTitle
        action={
          <button onClick={() => setShowForm((s) => !s)} className="text-primary flex items-center gap-1 text-xs font-semibold">
            <Icon name="add_circle" className="!text-[18px]" /> 계획 추가
          </button>
        }
      >
        스터디플래너
      </SectionTitle>

      {showForm && (
        <Card className="mb-4 space-y-3">
          <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
          <TextField label="뭐 할지" value={task} onChange={setTask} placeholder="예: 수학 익힘책 2단원" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="시작" type="time" value={startTime} onChange={setStartTime} />
            <TextField label="종료" type="time" value={endTime} onChange={setEndTime} />
          </div>
          <Button className="w-full" onClick={addTask}>추가하기</Button>
        </Card>
      )}

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-10">아직 스스로 짠 계획이 없어요.</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-xl bg-surface-container-high px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{getSubject(it.subjectId).label} · {it.material}</p>
              <p className="text-xs text-on-surface-variant">{it.startTime}{it.endTime ? ` - ${it.endTime}` : ''}</p>
            </div>
            <button onClick={() => actions.deletePlannerItem(today, it.id)} className="text-on-surface-variant">
              <Icon name="close" className="!text-[18px]" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/screens/student/StudentPlanner.tsx
git commit -m "feat: add student planner screen for self-directed tasks"
```

---

### Task 10: 캘린더 타임라인 컴포넌트 (학생·관리자 공용)

**Files:**
- Create: `src/screens/shared/StudyTimeline.tsx`

**Interfaces:**
- Consumes: `sessionsToTimelineBlocks`(Task 4), `state.plannerItems`, `state.studySessions`
- Produces: `export default function StudyTimelineScreen({ userId }: { userId?: string }): JSX.Element` — `userId` 없으면 본인, 있으면(관리자가 학생 조회 시) 해당 학생 기준

- [ ] **Step 1: 구현**

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, sessionsToTimelineBlocks } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar } from '../../primitives';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function StudyTimelineScreen() {
  const { state } = useAppState();
  const [selectedDate, setSelectedDate] = React.useState(todayKey());
  const items = (state.plannerItems[selectedDate] ?? []);

  const entries = items.flatMap((it) =>
    (state.studySessions[it.id] ?? []).map((session) => ({ session, subjectLabel: getSubject(it.subjectId).label }))
  );
  const blocks = sessionsToTimelineBlocks(entries);

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />
      <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="mb-4 rounded-lg border border-outline-variant px-3 py-2 text-sm" />
      <div className="space-y-0.5">
        {HOURS.map((h) => {
          const label = `${h.toString().padStart(2, '0')}:00`;
          const block = blocks.find((b) => b.startTime.slice(0, 2) === h.toString().padStart(2, '0'));
          return (
            <div key={h} className="flex items-center gap-2 h-6">
              <span className="text-[10px] text-on-surface-variant w-10 shrink-0">{label}</span>
              <div className={`flex-1 h-full rounded ${block ? (block.deviated ? 'bg-error/60' : 'bg-primary/60') : 'bg-surface-container'}`} title={block?.subjectLabel} />
            </div>
          );
        })}
      </div>
      {blocks.length === 0 && <p className="text-sm text-on-surface-variant text-center py-10">이 날은 기록이 없어요.</p>}
    </div>
  );
}
```

(시간당 1블록의 단순화된 표현이다 — 30분 이하 세션이 겹칠 때의 정밀 표시는 이후 개선 과제로 남긴다. 관리자가 다른 학생을 볼 때 쓸 `userId` 파라미터 기반 데이터 스위칭은 Task 6에서 관리자용 학생별 세션 조회 액션이 추가된 뒤 Task 15에서 연결한다.)

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/screens/shared/StudyTimeline.tsx
git commit -m "feat: add shared study-timeline calendar view"
```

---

### Task 11: 학생용 4탭 BottomNav + StudentAppShell 교체

**Files:**
- Modify: `src/primitives.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 8(StudentHome), Task 9(StudentPlanner), Task 10(StudyTimeline), 기존 `DistractionStopScreen`
- Produces: `STUDENT_NAV_TABS` 상수, `StudentAppShell`이 이 4탭으로 렌더링

- [ ] **Step 1: `src/constants.ts`에 학생용 탭 상수 추가**

```typescript
export const STUDENT_NAV_TABS = [
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'calendar', label: '캘린더', icon: 'calendar_today' },
  { id: 'planner', label: '스터디플래너', icon: 'edit_note' },
  { id: 'distractionStop', label: '딴짓 멈춰', icon: 'phonelink_lock' },
] as const;
```

- [ ] **Step 2: `primitives.tsx`의 `BottomNav`를 tabs 배열을 인자로 받도록 일반화**

```tsx
export function BottomNav<T extends { id: string; label: string; icon: string }>({
  tabs, active, onChange,
}: { tabs: readonly T[]; active: T['id']; onChange: (id: T['id']) => void }) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-surface-container-lowest border-t border-outline-variant/50 flex justify-around pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-30">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}>
            <Icon name={tab.icon} filled={isActive} />
            <span className="text-[11px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

(기존 호출부 `<BottomNav active={activeTab} onChange={setActiveTab} />`는 `<BottomNav tabs={NAV_TABS} active={activeTab} onChange={setActiveTab} />`로 수정.)

- [ ] **Step 3: `App.tsx`의 `StudentAppShell`을 4탭으로 교체**

Task 7에서 옮겨둔 기존 5탭 로직(원래의 `AppShell` 전체 — 캘린더/플래너/홈/체크/딴짓멈춰, 컨디션·studyLog·aiRecommendation 오버레이 등)은 이름을 `LegacyStudentAppShell`로 바꾸고 그대로 둔다(삭제하지 않음 — Global Constraints). `StudentAppShell`은 새로 아래처럼 작성:

```tsx
function StudentAppShell() {
  const [activeTab, setActiveTab] = React.useState<(typeof STUDENT_NAV_TABS)[number]['id']>('home');
  return (
    <div id="app-shell">
      {activeTab === 'home' && <StudentHomeScreen />}
      {activeTab === 'calendar' && <StudyTimelineScreen />}
      {activeTab === 'planner' && <StudentPlannerScreen />}
      {activeTab === 'distractionStop' && <DistractionStopScreen />}
      <BottomNav tabs={STUDENT_NAV_TABS} active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
```

관련 import(`StudentHomeScreen`, `StudentPlannerScreen`, `StudyTimelineScreen`, `STUDENT_NAV_TABS`) 추가.

- [ ] **Step 4: 타입체크 + 브라우저 확인**

Run: `npx tsc -b` 그리고 `npx vitest run`

브라우저에서 학생 계정으로 로그인해 4탭이 뜨는지, 홈에서 시작하기 → 타이머 카운트업 → 완료 누르면 상태 반영되는지 확인.

- [ ] **Step 5: Commit**

```bash
git add src/primitives.tsx src/App.tsx src/constants.ts
git commit -m "feat: switch student app to 4-tab shell (home/calendar/planner/distraction-stop)"
```

---

### Task 12: 딴짓 멈춰 탭 — 허용앱 목록 관리 UI

**Files:**
- Modify: `src/screens/DistractionStop.tsx`
- Modify: `src/types/distraction.ts`
- Modify: `src/native/distractionStop.ts`

**Interfaces:**
- Consumes: 기존 `DistractionState`
- Produces: `DistractionState.allowedApps: string[]`(패키지명 배열), `DistractionStop.setAllowedApps(opts: { apps: string[] })`

- [ ] **Step 1: 타입 확장**

`src/types/distraction.ts`의 `DistractionState`에 `allowedApps: string[];` 추가.

- [ ] **Step 2: `distractionStop.ts` 플러그인 인터페이스에 메서드 추가**

```typescript
setAllowedApps(opts: { apps: string[] }): Promise<DistractionState>;
```

- [ ] **Step 3: `DistractionStop.tsx` 화면에 섹션 추가**

기존 섹션들 아래에 텍스트 입력으로 패키지명을 추가/삭제하는 간단한 UI(추후 실제 기기의 "설치된 앱 목록에서 선택" UI로 고도화 가능 — 지금은 텍스트 입력):

```tsx
<div>
  <SectionTitle>허용앱 (학습 실행 중 이탈 감지 예외)</SectionTitle>
  <Card className="space-y-2">
    {state.allowedApps.map((pkg) => (
      <div key={pkg} className="flex items-center justify-between">
        <span className="text-sm">{pkg}</span>
        <button onClick={() => {
          const next = state.allowedApps.filter((p) => p !== pkg);
          setLocal((s) => s && { ...s, allowedApps: next });
          DistractionStop.setAllowedApps({ apps: next });
        }}>
          <Icon name="close" className="!text-[16px]" />
        </button>
      </div>
    ))}
    <AllowedAppAdder
      onAdd={(pkg) => {
        const next = [...state.allowedApps, pkg];
        setLocal((s) => s && { ...s, allowedApps: next });
        DistractionStop.setAllowedApps({ apps: next });
      }}
    />
  </Card>
</div>
```

`AllowedAppAdder`는 같은 파일 안에 작은 컴포넌트로 정의(패키지명 텍스트필드 + 추가 버튼, 예: `com.android.calculator2`).

- [ ] **Step 4: 타입체크**

Run: `npx tsc -b` — 네이티브 `setAllowedApps`는 Task 13에서 구현하므로 지금은 웹 쪽 타입만 맞춰둔다.

- [ ] **Step 5: Commit**

```bash
git add src/screens/DistractionStop.tsx src/types/distraction.ts src/native/distractionStop.ts
git commit -m "feat: add allowed-apps management UI to distraction-stop screen"
```

---

### Task 13: 네이티브 — 허용목록 기반 이탈 감지

**Files:**
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/TimerState.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/TimerStateStore.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/service/ForegroundAppAccessibilityService.kt`
- Modify: `android/app/src/main/res/xml/accessibility_service_config.xml`
- Test: `android/app/src/test/java/com/studybuddy/app/distraction/TimerStateTest.kt`

**Interfaces:**
- Consumes: 기존 `TimerState`, `TimerStateStore`
- Produces: `TimerState.allowedApps: Set<String>`, `TimerState.sessionActive: Boolean`, `DistractionStopPlugin.setAllowedApps`/`setSessionActive` 메서드, 이탈 시 JS로 보내는 `"sessionDeviated"` 이벤트

- [ ] **Step 1: `TimerState`에 필드 추가**

```kotlin
data class TimerState(
    val endTimeMillis: Long?,
    val exitMode: ExitMode,
    val gracePeriodSeconds: Int,
    val enabledApps: Set<BlockedApp>,
    val lockoutDurationMillis: Long,
    val featureEnabled: Boolean,
    val allowedApps: Set<String> = emptySet(),
    val sessionActive: Boolean = false
) {
    // ... 기존 isBreakActive/isWithinLockout 그대로
}
```

`DEFAULT`에도 `allowedApps = emptySet(), sessionActive = false` 추가.

- [ ] **Step 2: `TimerStateStore`에 JSON 직렬화 필드 추가 + 세터**

`toJson`/`fromJson`에 `allowedApps`(JSONArray)와 `sessionActive`(boolean) 추가. `TimerStateStore`에 메서드 추가:

```kotlin
suspend fun setAllowedApps(apps: Set<String>) {
    save(currentState().copy(allowedApps = apps))
}

suspend fun setSessionActive(active: Boolean) {
    save(currentState().copy(sessionActive = active))
}
```

- [ ] **Step 3: `DistractionStopPlugin`에 메서드 추가**

```kotlin
@PluginMethod
fun setAllowedApps(call: PluginCall) {
    val apps = call.getArray("apps")?.toList<String>()?.toSet() ?: run {
        call.reject("apps is required")
        return
    }
    scope.launch {
        store.setAllowedApps(apps)
        call.resolve(store.observeState().value.toJSObject())
    }
}

@PluginMethod
fun setSessionActive(call: PluginCall) {
    val active = call.getBoolean("active") ?: run {
        call.reject("active is required")
        return
    }
    scope.launch {
        store.setSessionActive(active)
        call.resolve(store.observeState().value.toJSObject())
    }
}
```

`toJSObject()`에 `obj.put("allowedApps", JSArray(allowedApps.toList()))`와 `obj.put("sessionActive", sessionActive)` 추가.

- [ ] **Step 4: `ForegroundAppAccessibilityService`에 이탈 감지 분기 추가**

기존 `onAccessibilityEvent`의 쉬는 시간 차단 로직(고정 3앱 대상) 앞에, 세션 실행 중 이탈 감지를 추가한다 — 이건 고정 3앱이 아니라 **우리 앱 자신을 제외한 모든 foreground 앱**을 대상으로 해야 하므로, 접근성 서비스의 `packageNames` 필터를 제거해 모든 앱 전환 이벤트를 받도록 바꾼다(Step 5). 코드:

```kotlin
override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val packageName = event.packageName?.toString() ?: return

    scope.launch {
        val state = store.observeState().value
        if (state.sessionActive && packageName != applicationContext.packageName && packageName !in state.allowedApps) {
            store.setSessionActive(false)
            // JS 쪽이 폴링 없이 즉시 반응하도록, 상태 변경은 TimerStateStore의 Flow를 통해 이미 DistractionStopPlugin.load()에서 notifyListeners로 전파된다.
            return@launch
        }

        val blockedApp = BlockedApp.fromPackageName(packageName) ?: return@launch
        // ...기존 쉬는 시간 차단 로직 이어서 그대로
    }
}
```

- [ ] **Step 5: `accessibility_service_config.xml`에서 `packageNames` 필터 제거**

```xml
<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:canRetrieveWindowContent="false"
    android:description="@string/accessibility_service_description"
    android:notificationTimeout="100" />
```

(패키지 필터를 없애면 모든 앱 전환에서 이벤트가 오므로, 기존 쉬는 시간 차단 로직은 `BlockedApp.fromPackageName(packageName) ?: return@launch`로 여전히 인스타/유튜브/틱톡 3종에만 반응 — 동작 변화 없음. 이탈 감지만 모든 앱을 본다.)

- [ ] **Step 6: `TimerStateTest.kt`에 새 필드 기본값 테스트 추가**

```kotlin
@Test
fun `DEFAULT has no allowed apps and inactive session`() {
    assertEquals(emptySet<String>(), TimerState.DEFAULT.allowedApps)
    assertEquals(false, TimerState.DEFAULT.sessionActive)
}
```

(이 환경은 Android SDK가 없어 `./gradlew test`를 직접 못 돌리므로, 사용자가 Android Studio에서 실행 확인.)

- [ ] **Step 7: 웹 쪽에서 세션 시작/종료 시 네이티브에 알리도록 연결**

Task 8의 `StudentHomeScreen`의 `handleStart`/`handleStop`에서, `isNativePlatform()`이면 `DistractionStop.setSessionActive({ active: true/false })`를 함께 호출하도록 수정(웹 브라우저에서는 no-op).

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main/java/com/studybuddy/app/distraction android/app/src/main/res/xml/accessibility_service_config.xml android/app/src/test/java/com/studybuddy/app/distraction/TimerStateTest.kt src/screens/student/StudentHome.tsx
git commit -m "feat: allow-list based session-deviation detection (pause timer, no force-switch)"
```

---

### Task 14: 관리자 앱 — 학생 목록 + 초대코드 표시/연결

**Files:**
- Create: `src/screens/manager/ManagerStudentList.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `state.managedStudents`(Task 6), `actions.linkByInviteCode`
- Produces: `export default function ManagerStudentListScreen({ onSelectStudent }: { onSelectStudent: (studentId: string) => void }): JSX.Element`

- [ ] **Step 1: 구현**

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { TopAppBar, Card, Button, TextField } from '../../primitives';

export default function ManagerStudentListScreen({ onSelectStudent }: { onSelectStudent: (studentId: string) => void }) {
  const { state, actions } = useAppState();
  const [code, setCode] = React.useState('');

  return (
    <div className="px-5 pt-4 pb-10">
      <TopAppBar />
      <h1 className="text-xl font-bold mt-2 mb-4">내 학생</h1>

      <Card className="mb-4 space-y-2">
        <TextField label="학생 초대코드" value={code} onChange={setCode} placeholder="예: A1B2C3D4" />
        <Button className="w-full" onClick={() => { actions.linkByInviteCode(code); setCode(''); }}>학생 연결하기</Button>
      </Card>

      <div className="space-y-2">
        {state.managedStudents.length === 0 && <p className="text-sm text-on-surface-variant text-center py-10">아직 연결된 학생이 없어요.</p>}
        {state.managedStudents.map((s) => (
          <button key={s.id} onClick={() => onSelectStudent(s.id)} className="w-full text-left">
            <Card className="flex items-center justify-between">
              <p className="text-sm font-bold">{s.goal || '학생'}</p>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
```

(`Profile`에 표시할 이름 필드가 따로 없어 `goal`로 임시 표시 — 추후 `displayName` 필드 추가는 이번 범위 밖으로 보류.)

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/screens/manager/ManagerStudentList.tsx
git commit -m "feat: add manager student-list screen with invite-code linking"
```

---

### Task 15: 관리자 앱 — 숙제 등록/수정 + 학생 캘린더 보기

**Files:**
- Create: `src/screens/manager/ManagerHomeworkForm.tsx`
- Modify: `src/App.tsx` (`ManagerAppShell`을 학생 목록 → 선택 시 숙제 등록/캘린더 화면으로 완성)

**Interfaces:**
- Consumes: `actions.createHomeworkAssignment`(Task 6), `StudyTimelineScreen`(Task 10)
- Produces: `export default function ManagerHomeworkFormScreen({ studentId, onBack }: { studentId: string; onBack: () => void }): JSX.Element`

- [ ] **Step 1: 구현**

```tsx
import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { SUBJECTS } from '../../constants';
import { BackBar, Card, Button, ChipGroup, TextField, SectionTitle } from '../../primitives';
import type { SubjectId } from '../../types';

export default function ManagerHomeworkFormScreen({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const { state, actions } = useAppState();
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [material, setMaterial] = React.useState('');
  const [amountPerDay, setAmountPerDay] = React.useState('');
  const [startDate, setStartDate] = React.useState(todayKey());
  const [endDate, setEndDate] = React.useState(todayKey());

  const studentAssignments = state.homeworkAssignments.filter((a) => a.studentId === studentId);

  const submit = () => {
    if (!material.trim() || !amountPerDay.trim()) return;
    actions.createHomeworkAssignment(studentId, { subjectId, material, amountPerDay, startDate, endDate });
    setMaterial('');
    setAmountPerDay('');
  };

  return (
    <div className="px-5 pt-2 pb-10">
      <BackBar title="숙제 관리" onBack={onBack} />

      <Card className="mt-3 mb-5 space-y-3">
        <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
        <TextField label="문제집/자료" value={material} onChange={setMaterial} placeholder="예: 쎈 수학 (상)" />
        <TextField label="하루 분량" value={amountPerDay} onChange={setAmountPerDay} placeholder="예: 10페이지" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="시작일" type="date" value={startDate} onChange={setStartDate} />
          <TextField label="종료일" type="date" value={endDate} onChange={setEndDate} />
        </div>
        <Button className="w-full" onClick={submit}>숙제 등록</Button>
      </Card>

      <SectionTitle>등록된 숙제</SectionTitle>
      <div className="space-y-2">
        {studentAssignments.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">등록된 숙제가 없어요.</p>}
        {studentAssignments.map((a) => (
          <div key={a.id} className="rounded-xl bg-surface-container-high px-4 py-3">
            <p className="text-sm font-semibold">{a.material} · {a.amountPerDay}</p>
            <p className="text-xs text-on-surface-variant">{a.startDate} ~ {a.endDate}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

(개별 숙제 수정 UI는 목록 항목 탭 → 폼 재사용으로 후속 확장 가능하도록 남겨두고, 이번 태스크는 등록 + 목록 확인까지로 범위를 좁힌다.)

- [ ] **Step 2: `App.tsx`의 `ManagerAppShell` 완성**

```tsx
function ManagerAppShell() {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<'homework' | 'timeline'>('homework');

  if (!selectedStudentId) {
    return <ManagerStudentListScreen onSelectStudent={setSelectedStudentId} />;
  }
  return (
    <div id="app-shell">
      {tab === 'homework' && <ManagerHomeworkFormScreen studentId={selectedStudentId} onBack={() => setSelectedStudentId(null)} />}
      {tab === 'timeline' && <StudyTimelineScreen />}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-surface-container-lowest rounded-full p-1 shadow-card">
        <button onClick={() => setTab('homework')} className={`px-4 py-2 rounded-full text-xs font-semibold ${tab === 'homework' ? 'bg-primary text-on-primary' : ''}`}>숙제</button>
        <button onClick={() => setTab('timeline')} className={`px-4 py-2 rounded-full text-xs font-semibold ${tab === 'timeline' ? 'bg-primary text-on-primary' : ''}`}>캘린더</button>
      </div>
    </div>
  );
}
```

(`StudyTimelineScreen`이 지금은 로그인한 본인 기준 데이터만 보므로, 관리자가 선택한 학생의 세션을 보려면 Task 6에 학생별 세션 조회 액션을 추가해야 한다 — 이건 알려진 제약으로 다음 이터레이션 과제로 남긴다. 이번 태스크는 화면 배선까지.)

- [ ] **Step 3: 타입체크 + 전체 테스트**

Run: `npx tsc -b && npx vitest run`
Expected: 둘 다 PASS

- [ ] **Step 4: Commit**

```bash
git add src/screens/manager/ManagerHomeworkForm.tsx src/App.tsx
git commit -m "feat: complete manager app shell with homework form and student calendar tabs"
```

---

## 알려진 제약 (이번 계획 범위 밖)

- 관리자가 선택한 학생의 세션/타임라인을 실제로 불러오는 부분(Task 15에서 언급) — `StudyTimelineScreen`이 지금은 로그인한 사용자 본인 데이터만 봄. 다음 계획에서 `actions.loadStudentSessions(studentId)` 추가 필요.
- 숙제 개별 수정 UI, 설치된 앱 선택 UI(허용앱을 패키지명 직접 입력 대신 목록에서 고르기), 온보딩 화면의 정확한 문구 다듬기는 후속 과제.
- 딴짓 멈춰 네이티브 변경(Task 13)은 이 환경에서 컴파일 검증 불가 — Android Studio에서 사용자가 직접 빌드/확인해야 한다(기존 딴짓 멈춰 기능 개발 때와 동일한 제약).
