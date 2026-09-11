붙여진 소스만 기준으로 봤습니다. RLS 정책/마이그레이션, 화면별 호출부, Supabase Edge Function은 보이지 않아서 그 영역은 확정 판단하지 않았습니다.

- **[높음] 초기 로드 실패가 온보딩 화면으로 둔갑할 수 있음**
- **위치**: `src/state/AppStateContext.tsx`, `loadAll` / `BootstrapShell` 근처
- **왜 문제인가**: `sb_profiles` 조회가 네트워크/RLS/서버 오류로 실패해도 `profileRes.error`를 보지 않고 `profile = null`로 처리합니다. 그러면 기존 가입자도 `state.loading=false, profile=null`이 되어 온보딩 화면으로 떨어질 수 있습니다. 사용자가 저장을 누르면 기존 프로필을 덮어쓰는 경로가 열립니다.
- **어떻게 고치는가**:

```ts
async function assertOk<T>(res: { data: T; error: { message: string } | null }, label: string): Promise<T> {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res.data;
}

async function loadAll(userId: string): Promise<AppState> {
  const [profileRes, itemsRes, homeworkRes, sessionsRes] = await Promise.all([
    supabase.from('sb_profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('sb_planner_items').select('*').eq('user_id', userId).order('order'),
    supabase.from('sb_homework_assignments').select('*').eq('student_id', userId),
    supabase.from('sb_study_sessions').select('*').eq('user_id', userId),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (homeworkRes.error) throw homeworkRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

  // 기존 로직 계속
}
```

그리고 호출부도 실패 상태를 명시해야 합니다.

```ts
React.useEffect(() => {
  let cancelled = false;

  loadAll(userId)
    .then((loaded) => {
      if (!cancelled) {
        setState(loaded);
        void actions.loadAllowedAppIntervals(userId);
      }
    })
    .catch((err) => {
      console.error('loadAll failed:', err);
      if (!cancelled) {
        setState((s) => ({ ...s, loading: false, error: '불러오지 못했어요. 다시 시도해주세요.' }));
      }
    });

  return () => {
    cancelled = true;
  };
}, [userId]);
```

- **확신도**: 확실

---

- **[높음] 낙관적 생성 실패 시 로컬 항목이 남아 DB와 영구 불일치 가능**
- **위치**: `src/state/AppStateContext.tsx`, `addPlannerItem`
- **왜 문제인가**: `sb_planner_items.insert`가 실패해도 낙관적으로 추가한 `plannerItems`와 `plannerItemsRef`를 되돌리지 않습니다. 특히 지연 숙제 생성 effect가 이 항목을 보고 `alreadyGenerated`로 판단하면, 실제 DB에는 없는데 화면에는 생성된 것처럼 보이고 같은 세션에서는 재시도도 막힙니다.
- **어떻게 고치는가**:

```ts
if (error) {
  console.error('addPlannerItem failed:', error.message);

  plannerItemsRef.current = {
    ...plannerItemsRef.current,
    [date]: (plannerItemsRef.current[date] ?? []).filter((i) => i.id !== id),
  };

  setState((s) => ({
    ...s,
    plannerItems: {
      ...s.plannerItems,
      [date]: (s.plannerItems[date] ?? []).filter((i) => i.id !== id),
    },
    error: WRITE_FAILURE_MESSAGE,
  }));
  return;
}
```

- **확신도**: 확실

---

- **[높음] 이월 처리 중 한 쪽 쓰기만 성공하면 숙제가 사라지거나 중복됨**
- **위치**: `src/state/AppStateContext.tsx`, `carryOverPlannerItem`
- **왜 문제인가**: 원본을 `carried_over`로 바꾸는 update와 다음 날 clone insert가 별도 요청입니다. update 성공 후 insert 실패면 오늘 항목은 이월됨으로 바뀌었지만 내일 항목은 없습니다. 반대로 update 실패 후 insert 성공이면 오늘에도 남고 내일에도 생깁니다.
- **어떻게 고치는가**: 가장 안전한 수정은 RPC/Edge Function으로 트랜잭션화하는 것입니다.

```ts
const { error } = await supabase.rpc('carry_over_planner_item', {
  source_item_id: id,
  target_item_id: cloneId,
  target_date: tomorrowKey,
  target_order: order,
});

if (error) {
  console.error('carryOverPlannerItem failed:', error.message);
  setState((s) => ({ ...s, plannerItems: previousPlannerItems, error: WRITE_FAILURE_MESSAGE }));
  return;
}
```

DB 함수는 한 트랜잭션 안에서 처리해야 합니다.

```sql
create or replace function carry_over_planner_item(
  source_item_id uuid,
  target_item_id uuid,
  target_date date,
  target_order integer
) returns void
language plpgsql
security invoker
as $$
begin
  update sb_planner_items
  set status = 'carried_over'
  where id = source_item_id;

  insert into sb_planner_items (
    id, user_id, date, "order", subject_id, start_time, study_type,
    material, unit, page_range, end_time, difficulty, rest_pattern,
    must_do, status, actual_minutes, understanding, partial_reason,
    incomplete_reason, source, homework_assignment_id, exam_subject_range_id
  )
  select
    target_item_id, user_id, target_date, target_order, subject_id, start_time, study_type,
    material, unit, page_range, end_time, difficulty, rest_pattern,
    must_do, 'planned', null, null, null,
    null, source, homework_assignment_id, exam_subject_range_id
  from sb_planner_items
  where id = source_item_id;
end;
$$;
```

- **확신도**: 확실

---

- **[높음] 시험 범위 등록 실패 시 range만 남거나 planner item만 로컬에 남음**
- **위치**: `src/state/AppStateContext.tsx`, `registerHomeworkRange`
- **왜 문제인가**: `sb_exam_subject_ranges.insert` 성공 후 `sb_planner_items.insert`가 실패하면 DB에는 범위가 있는데 실제 날짜별 숙제 항목이 없습니다. 현재는 에러 배너만 띄우고 낙관적 `examSubjectRanges`, `studentPlannerItems`, `studentPlannerItemsRef`를 되돌리지 않습니다.
- **어떻게 고치는가**:

```ts
const previousRanges = state.examSubjectRanges;
const previousStudentItems = studentPlannerItemsRef.current[studentId] ?? {};

setState((s) => ({ ...s, examSubjectRanges: [...s.examSubjectRanges, fullRange] }));

// ...

if (itemsError) {
  console.error('registerHomeworkRange (items) failed:', itemsError.message);

  await supabase.from('sb_exam_subject_ranges').delete().eq('id', rangeId);

  studentPlannerItemsRef.current = {
    ...studentPlannerItemsRef.current,
    [studentId]: previousStudentItems,
  };

  setState((s) => ({
    ...s,
    examSubjectRanges: previousRanges,
    studentPlannerItems: { ...s.studentPlannerItems, [studentId]: previousStudentItems },
    error: WRITE_FAILURE_MESSAGE,
  }));
  return;
}
```

더 좋은 해법은 `exam_subject_range + planner_items` 생성을 서버 RPC 하나로 묶는 것입니다.

- **확신도**: 확실

---

- **[보통] `useConfirm`을 동시에 두 번 호출하면 첫 Promise가 영원히 resolve되지 않음**
- **위치**: `src/primitives.tsx`, `useConfirm`
- **왜 문제인가**: `confirm()`이 호출될 때 기존 `pending`이 있으면 새 `{ message, resolve }`로 덮어씁니다. 예를 들어 삭제 버튼을 빠르게 두 번 누르거나 서로 다른 confirm 액션이 겹치면 첫 호출자는 영원히 대기합니다.
- **어떻게 고치는가**:

```tsx
export function useConfirm() {
  const [pending, setPending] = React.useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  const pendingRef = React.useRef<typeof pending>(null);

  React.useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const confirm = React.useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      pendingRef.current?.resolve(false);
      setPending({ message, resolve });
    });
  }, []);

  const settle = React.useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  // confirmDialog는 기존과 동일
}
```

- **확신도**: 확실

---

- **[보통] `ToggleSwitch`가 키보드/스크린리더에서 스위치로 동작하지 않음**
- **위치**: `src/primitives.tsx`, `ToggleSwitch`
- **왜 문제인가**: 실제 조작 대상이 `span onClick`입니다. 마우스/터치는 되지만 키보드 포커스, Space/Enter 조작, `checked` 상태 전달이 빠집니다. 접근성 한 바퀴를 돌았다고 했지만 이 컴포넌트는 남아 있습니다.
- **어떻게 고치는가**:

```tsx
export function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  const id = React.useId();

  return (
    <div className="flex items-center justify-between">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-on-surface">
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-11 w-11 items-center rounded-full transition ${
          checked ? 'bg-primary' : 'bg-surface-container-high'
        }`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
```

- **확신도**: 확실

---

- **[보통] 여러 낙관적 update 실패가 롤백 없이 화면만 성공처럼 남음**
- **위치**: `src/state/AppStateContext.tsx`, `updatePlannerItem`, `updateHomeworkAssignment`, `updateStudentPlannerItem`, `updateStudentLabel`, `updateManagerLabel`, `upsertTutoringSchedule`, `addTutoringException`
- **왜 문제인가**: 저장 실패 시 에러 배너만 뜨고 이미 바뀐 화면 상태를 되돌리지 않습니다. 예를 들어 관리자가 숙제 내용을 “10쪽”으로 수정했는데 update가 실패하면 화면은 “10쪽”, DB는 이전 값입니다. 앱을 새로 열기 전까지 사용자는 실패를 인지하기 어렵고 다음 동작이 잘못된 상태를 기준으로 이어집니다.
- **어떻게 고치는가**: 각 액션에서 이전 값을 잡고 실패 시 복구합니다. 예시는 `updatePlannerItem`입니다.

```ts
async updatePlannerItem(date, id, patch) {
  const previousList = plannerItemsRef.current[date] ?? [];
  const previousItem = previousList.find((i) => i.id === id);

  plannerItemsRef.current = {
    ...plannerItemsRef.current,
    [date]: previousList.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  };

  setState((s) => ({
    ...s,
    plannerItems: {
      ...s.plannerItems,
      [date]: (s.plannerItems[date] ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i)),
    },
  }));

  const { error } = await supabase.from('sb_planner_items').update(dbPatch).eq('id', id);

  if (error) {
    plannerItemsRef.current = { ...plannerItemsRef.current, [date]: previousList };
    setState((s) => ({
      ...s,
      plannerItems: { ...s.plannerItems, [date]: previousList },
      error: WRITE_FAILURE_MESSAGE,
    }));
    return;
  }

  // 성공 후 track/notify
}
```

- **확신도**: 확실

---

- **[낮음] `splitPagesAcrossDates`가 날짜 수가 페이지 수보다 많으면 `1~0페이지` 같은 역범위를 만듦**
- **위치**: `src/lib.ts`, `splitPagesAcrossDates`
- **왜 문제인가**: 예를 들어 `startPage=1`, `endPage=3`, `selectedDates=5일`이면 `base=0`이고 마지막 전 날짜들은 `1~0페이지`처럼 잘못된 범위가 됩니다. 관리자가 시험 범위를 너무 많은 날짜에 배정하면 학생 숙제에 말이 안 되는 범위가 저장됩니다.
- **어떻게 고치는가**:

```ts
export function splitPagesAcrossDates(startPage: number, endPage: number, selectedDates: DateKey[]): { date: DateKey; pageRange: string }[] {
  if (selectedDates.length === 0) return [];
  if (endPage < startPage) return [];

  const sorted = [...selectedDates].sort();
  const totalPages = endPage - startPage + 1;
  const usableDates = sorted.slice(0, totalPages);

  const base = Math.floor(totalPages / usableDates.length);
  const remainder = totalPages - base * usableDates.length;

  const result: { date: DateKey; pageRange: string }[] = [];
  let cursor = startPage;

  usableDates.forEach((date, idx) => {
    const isLast = idx === usableDates.length - 1;
    const count = base + (isLast ? remainder : 0);
    const rangeStart = cursor;
    const rangeEnd = cursor + count - 1;
    result.push({ date, pageRange: `${rangeStart}~${rangeEnd}페이지` });
    cursor = rangeEnd + 1;
  });

  return result;
}
```

- **확신도**: 확실

---

**문제를 못 찾은 영역**

`dayKeyOf`, `dayStartOf`, `monthGrid`, `weekStrip`, `toMinutesOfDay`의 4시 하루 경계/로컬 시간 변환 자체는 붙여진 코드 기준으로 의도와 맞습니다. `ThemeContext`, `mappers`의 단순 매핑, `socialAuth`의 네이티브 OAuth 흐름에서도 붙여진 범위 안에서는 정확성 버그를 못 찾았습니다.

RLS·권한 구멍은 정책 파일이 없어서 확정 리뷰가 불가능합니다. 확인하려면 `supabase/migrations`의 RLS 정책, 특히 `sb_planner_items`, `sb_exam_*`, `sb_student_manager_links`, `sb_homework_reminder_settings`, `delete-account` 함수 코드가 필요합니다.
