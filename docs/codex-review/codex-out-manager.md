아래 리뷰는 붙여주신 코드만 기준입니다. `actions`, `todayKey`, `toMinutesOfDay`, Supabase RLS 정책은 보이지 않아서 그쪽은 추측하지 않았습니다. 확인이 필요한 항목은 명시했습니다.

- **[높음] 타임라인이 “허용앱 사용만 있는 날”을 전부 버립니다**
- **위치**: `src/screens/shared/TimelineColumn.tsx`, `TimelineColumn` 초반
- **왜 문제인가**: 매니저 홈은 `ChecklistTimeline`에 `allowedAppIntervals`를 넘깁니다. 그런데 `TimelineColumn`은 `segments.length === 0`이면 바로 `기록 없음`을 반환합니다. 학생이 공부 타이머 기록은 없지만 허용앱 사용 기록은 있는 경우, 매니저는 허용앱 사용 흔적을 타임라인에서 볼 수 없습니다.
- **어떻게 고치는가**:

```tsx
export function TimelineColumn({
  segments,
  allowedAppSpans = [],
}: {
  segments: TimelineSegment[];
  allowedAppSpans?: AllowedAppSpan[];
}) {
  if (segments.length === 0 && allowedAppSpans.length === 0) {
    return <p className="text-xs text-on-surface-variant text-center py-6">기록 없음</p>;
  }

  const allStarts = [
    ...segments.map((s) => s.startMinutes),
    ...allowedAppSpans.map((s) => s.startMinutes),
  ];
  const allEnds = [
    ...segments.map((s) => s.endMinutes),
    ...allowedAppSpans.map((s) => s.endMinutes),
  ];

  const minHour = Math.max(0, Math.floor(Math.min(...allStarts) / 60));
  const maxHour = Math.min(24, Math.ceil(Math.max(...allEnds) / 60));

  // 이하 동일
```

그리고 셀 렌더링에서 `seg`가 없어도 `allowed`면 패턴이 보이게 해야 합니다.

```tsx
const className = seg ? undefined : allowed ? undefined : 'bg-surface-container';

const style = seg
  ? {
      backgroundColor: seg.color,
      opacity: 0.8,
      backgroundImage: allowed
        ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0 2px, transparent 2px 4px)'
        : undefined,
    }
  : allowed
    ? {
        backgroundColor: 'rgb(var(--surface-container-highest))',
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0 2px, transparent 2px 4px)',
      }
    : undefined;
```

- **확신도**: 확실

---

- **[높음] 페이지 범위에 숫자가 아닌 값이 들어가도 저장될 수 있습니다**
- **위치**: `src/screens/manager/ManagerProgress.tsx`, `submitRange`
- **왜 문제인가**: `type="number"`는 UI 힌트일 뿐이고, 상태값은 문자열입니다. `startPage="abc"` 또는 `"1e3"` 같은 값이 들어오면 `Number(startPage)`가 `NaN` 또는 의도와 다른 숫자가 됩니다. 현재 검증은 `Number(startPage) > Number(endPage)`뿐이라 `NaN`은 통과합니다. 그러면 `registerHomeworkRange` / `updateHomeworkRange`에 깨진 범위가 넘어갑니다.
- **어떻게 고치는가**:

```tsx
const parsePositivePage = (value: string) => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const submitRange = () => {
  if (!rangeSubjectId) return;

  if (!material.trim()) {
    setRangeError('교재명을 입력해주세요.');
    return;
  }

  let scope:
    | { mode: 'pages'; startPage: number; endPage: number }
    | { mode: 'custom'; customLabel: string };

  if (rangeMode === 'pages') {
    const parsedStart = parsePositivePage(startPage);
    const parsedEnd = parsePositivePage(endPage);

    if (parsedStart == null || parsedEnd == null) {
      setRangeError('페이지는 1 이상의 숫자로 입력해주세요.');
      return;
    }

    if (parsedStart > parsedEnd) {
      setRangeError('끝 페이지가 시작 페이지보다 커야 해요.');
      return;
    }

    scope = { mode: 'pages', startPage: parsedStart, endPage: parsedEnd };
  } else {
    if (!customLabel.trim()) {
      setRangeError('학습 내용을 입력해주세요.');
      return;
    }
    scope = { mode: 'custom', customLabel: customLabel.trim() };
  }

  // 이하 기존 로직
};
```

- **확신도**: 확실

---

- **[보통] 저장 실패가 화면에서 성공처럼 보입니다**
- **위치**: `ManagerCalendarScreen`의 `addTutoringException`, `upsertTutoringSchedule`, `createHomeworkProposal`, `upsertHomeworkReminderSetting`; `ManagerProgressScreen`의 `submitRange`, `submitSubject`; `ManagerStudentListScreen`의 `linkByInviteCode`; `PlannerItemRow`의 `commit`
- **왜 문제인가**: 여러 액션 호출이 `await` 없이 실행되고, 즉시 시트를 닫거나 입력값을 초기화합니다. 네트워크 실패, RLS 거부, Edge Function 실패가 나도 사용자는 저장된 것으로 이해합니다. 예를 들어 숙제 제안 저장이 실패해도 `proposalSheetOpen`이 닫혀 입력 내용이 사라집니다.
- **어떻게 고치는가**: 액션이 Promise를 반환한다는 전제가 필요합니다. 반환 타입이 보이지 않으므로 `AppStateContext`의 actions 정의가 필요합니다. 형태는 아래처럼 바꾸는 게 맞습니다.

```tsx
const [proposalError, setProposalError] = React.useState<string | null>(null);
const [savingProposal, setSavingProposal] = React.useState(false);

<Button
  className="w-full"
  disabled={savingProposal}
  onClick={async () => {
    setProposalError(null);
    setSavingProposal(true);
    try {
      await actions.createHomeworkProposal(studentId, {
        date: selectedDate,
        subjectId: proposalSubjectId,
        material: proposalMaterial.trim(),
        pageRange: proposalPageRange.trim(),
      });
      setProposalSheetOpen(false);
    } catch {
      setProposalError('숙제 제안을 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setSavingProposal(false);
    }
  }}
>
  {savingProposal ? '보내는 중' : '제안 보내기'}
</Button>

{proposalError && (
  <p role="alert" className="text-xs font-semibold text-error">
    {proposalError}
  </p>
)}
```

- **확신도**: 추정  
  확인 필요: `actions.*`가 Promise를 반환하는지, 실패를 throw하는지, 내부에서 전역 toast를 띄우는지 확인하려면 `src/state/AppStateContext`와 해당 action 구현이 필요합니다.

---

- **[보통] 시험 추가 실패 시 `selectedExamId`가 깨질 수 있습니다**
- **위치**: `src/screens/manager/ManagerProgress.tsx`, `submitExam`
- **왜 문제인가**: `createExamRecord` 결과를 바로 `setSelectedExamId(id)`에 넣습니다. 생성 실패 시 `id`가 `null`, `undefined`, 빈 문자열일 가능성을 배제할 수 없습니다. 그러면 폼은 닫히고 입력값은 사라졌는데 선택된 시험은 없거나 잘못된 상태가 됩니다.
- **어떻게 고치는가**:

```tsx
const [examError, setExamError] = React.useState<string | null>(null);

const submitExam = async () => {
  if (!examTitle.trim()) {
    setExamError('시험명을 입력해주세요.');
    return;
  }

  setExamError(null);

  try {
    const id = await actions.createExamRecord(studentId, {
      title: examTitle.trim(),
      examDate,
      isMain: examIsMain,
    });

    if (!id) {
      setExamError('시험을 추가하지 못했어요. 다시 시도해주세요.');
      return;
    }

    setExamTitle('');
    setExamIsMain(false);
    setShowExamForm(false);
    setSelectedExamId(id);
  } catch {
    setExamError('시험을 추가하지 못했어요. 다시 시도해주세요.');
  }
};
```

폼 안에는:

```tsx
{examError && (
  <p role="alert" className="text-xs font-semibold text-error">
    {examError}
  </p>
)}
```

- **확신도**: 추정  
  확인 필요: `createExamRecord`의 실패 반환/throw 계약.

---

- **[보통] 새벽 4시 하루 경계가 허용앱 요약/합계에 적용되는지 이 파일들만으로 확인 불가**
- **위치**: `ManagerHomeScreen`, `ManagerStudentListScreen`, `allowedAppSummary`, `totalUsageSeconds`
- **왜 문제인가**: 제품 규칙상 하루는 새벽 4시에 넘어갑니다. 그런데 화면은 `state.allowedAppIntervals[studentId] ?? []` 전체를 그대로 합산합니다. 이 배열이 이미 “앱 기준 오늘”으로 필터링된 값인지 보이지 않습니다. 만약 전날 23:00 사용분과 오늘 09:00 사용분이 함께 들어오면 `오늘 허용앱 N분`이 누적 전체처럼 보일 수 있습니다.
- **어떻게 고치는가**: 화면 가까이에서 방어하려면 앱 날짜 키로 필터링해서 넘기는 식이 필요합니다. 단, `dateKey`를 만드는 기존 lib 함수가 필요합니다.

```ts
function intervalsForStudyDay(intervals: AllowedAppInterval[], dayKey: string) {
  return intervals.filter((i) => studyDayKeyFromIso(i.startedAt) === dayKey);
}
```

사용부:

```tsx
const todayAllowedIntervals = intervalsForStudyDay(
  state.allowedAppIntervals[studentId] ?? [],
  today
);

const allowedSeconds = totalUsageSeconds(todayAllowedIntervals);
const usageSummary = allowedAppSummary(todayAllowedIntervals, Date.now());
```

- **확신도**: 추정  
  확인 필요: `loadAllowedAppIntervals` 또는 `state.allowedAppIntervals`를 채우는 action 구현, `todayKey`와 날짜 유틸 파일.

---

- **[낮음] `CompactMonthPicker`는 선택 상태를 스크린리더에 전달하지 않습니다**
- **위치**: `src/screens/manager/ManagerProgress.tsx`, `CompactMonthPicker`
- **왜 문제인가**: 날짜 다중 선택 UI인데 `aria-pressed` 또는 `aria-label`이 없습니다. 화면상 선택된 날짜는 색으로 보이지만, 스크린리더 사용자는 어떤 날짜가 선택됐는지 알기 어렵습니다. 이미 접근성 한 바퀴를 돌았다고 했지만 이 커스텀 날짜 선택기는 누락돼 보입니다.
- **어떻게 고치는가**:

```tsx
<button
  key={d.key}
  disabled={isDisabled}
  aria-pressed={isSelected}
  aria-label={`${Number(d.key.split('-')[1])}월 ${Number(d.key.split('-')[2])}일${
    isSelected ? ', 선택됨' : ''
  }${isLocked ? ', 수정할 수 없음' : ''}${isDisabled ? ', 선택할 수 없음' : ''}`}
  onClick={() => !isLocked && !isDisabled && onToggleDate(d.key)}
  className="flex flex-col items-center justify-center py-0.5"
>
```

- **확신도**: 확실

---

**문제를 못 찾은 영역**

`calendarDayLabel.ts`, `TutoringMark.tsx`, `DayProgressRing.tsx`는 붙여주신 범위 안에서는 의도와 구현이 잘 맞습니다. `PlannerItemRow`의 “관리자는 학생 self 계획을 수정하지 않는다” 결정도 주석과 구현이 일치합니다.

RLS·권한 구멍은 이 소스만으로는 판단할 수 없습니다. 확인하려면 Supabase policy SQL, Edge Function 코드, `AppStateContext`의 action 구현이 필요합니다.
