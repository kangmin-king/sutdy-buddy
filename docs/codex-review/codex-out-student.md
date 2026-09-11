아래는 붙여주신 소스만 기준으로 본 리뷰입니다. RLS/서버 권한은 정책·액션 구현이 없어 검증할 수 없었습니다. 이 영역은 `AppStateContext`의 action 구현, Supabase RLS 정책, 엣지 함수 코드가 필요합니다.

- **[높음] 모의고사 타이머가 시간 초과로 끝나도 “수고하셨어요!”로 표시됨**
- **위치**: `MockExamTimer.tsx`, `MockExamTimerScreen` 대략 55~150줄
- **왜 문제인가**: `timeUp`은 `running && remainingMs <= 0`입니다. 시간이 끝나면 effect에서 `setRunning(false)`를 호출하므로 다음 렌더에서 `timeUp`이 `false`가 됩니다. 결과적으로 `done` 화면은 시간 초과 종료인데도 `🙌`, `수고하셨어요!`를 보여줍니다.
- **어떻게 고치는가**:

```tsx
const [endedReason, setEndedReason] = React.useState<'time_up' | 'manual' | null>(null);

React.useEffect(() => {
  if (timeUp) {
    setRunning(false);
    setEndAt(null);
    setRemainingMsPaused(0);
    setEndedReason('time_up');
    setPhase('done');
    track('Ended Mock Exam Timer', {
      preset_id: presetId,
      planned_minutes: totalMinutes,
      elapsed_seconds: Math.round(totalMs / 1000),
      ended_reason: 'time_up',
    });
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  }
}, [timeUp, presetId, totalMinutes, totalMs]);

const handleFinish = () => {
  const remaining = running && endAt != null ? Math.max(0, endAt - Date.now()) : (remainingMsPaused ?? totalMs);
  setRemainingMsPaused(remaining);
  setRunning(false);
  setEndAt(null);
  setEndedReason('manual');
  setPhase('done');
  track('Ended Mock Exam Timer', {
    preset_id: presetId,
    planned_minutes: totalMinutes,
    elapsed_seconds: Math.round((totalMs - remaining) / 1000),
    ended_reason: 'manual',
  });
};

const handleReset = () => {
  setRunning(false);
  setEndAt(null);
  setRemainingMsPaused(null);
  setEndedReason(null);
  setPhase('setup');
};
```

```tsx
{phase === 'done' && (
  <>
    <p className="text-5xl">{endedReason === 'time_up' ? '⏰' : '🙌'}</p>
    <p className="text-lg font-bold text-on-surface">
      {endedReason === 'time_up' ? '시험 시간이 끝났어요' : '수고하셨어요!'}
    </p>
  </>
)}
```

- **확신도**: 확실

---

- **[보통] 시험 일정이 나중에 로드되면 첫 시험이 자동으로 열리지 않음**
- **위치**: `ExamSchedule.tsx`, `ExamSchedule` 대략 18~25줄
- **왜 문제인가**: `openExamId` 초기값은 첫 렌더의 `exams[0]?.id`로만 정해집니다. 첫 렌더에서 `examRecords`가 비어 있고 이후 비동기로 채워지는 흐름이면, 시험 일정은 나타나지만 아무 카드도 열리지 않습니다. 의도한 “첫 시험 기본 열림”과 달라집니다.
- **어떻게 고치는가**:

```tsx
const [openExamId, setOpenExamId] = React.useState<string | null>(null);

React.useEffect(() => {
  if (exams.length === 0) {
    setOpenExamId(null);
    return;
  }

  setOpenExamId((current) =>
    current && exams.some((exam) => exam.id === current) ? current : exams[0].id,
  );
}, [exams]);
```

더 안정적으로 하려면 `exams` 배열이 매 렌더 새로 만들어지므로 id 문자열 의존성으로 줄일 수 있습니다.

```tsx
const examIds = exams.map((exam) => exam.id).join('|');

React.useEffect(() => {
  if (exams.length === 0) {
    setOpenExamId(null);
    return;
  }

  setOpenExamId((current) =>
    current && exams.some((exam) => exam.id === current) ? current : exams[0].id,
  );
}, [examIds]);
```

- **확신도**: 확실

---

- **[보통] 허용앱 사용 기록만 있는 날은 타임라인에 표시되지 않음**
- **위치**: `TimelineColumn.tsx`, `TimelineColumn` 대략 28~38줄
- **왜 문제인가**: `segments.length === 0`이면 바로 “기록 없음”을 반환합니다. 그런데 `allowedAppSpans`는 별도로 들어옵니다. 예를 들어 학생이 공부 세션은 정상 종료하지 못했거나 아직 종료된 공부 기록은 없지만 허용앱 사용 구간은 서버에 있는 경우, 매니저/학생은 허용앱 사용 흔적을 타임라인에서 전혀 볼 수 없습니다.
- **어떻게 고치는가**:

```tsx
export function TimelineColumn({
  segments,
  allowedAppSpans = [],
}: {
  segments: TimelineSegment[];
  allowedAppSpans?: AllowedAppSpan[];
}) {
  const bounds = [
    ...segments.map((s) => ({ startMinutes: s.startMinutes, endMinutes: s.endMinutes })),
    ...allowedAppSpans,
  ];

  if (bounds.length === 0) {
    return <p className="text-xs text-on-surface-variant text-center py-6">기록 없음</p>;
  }

  const minHour = Math.max(0, Math.floor(Math.min(...bounds.map((s) => s.startMinutes)) / 60));
  const maxHour = Math.min(24, Math.ceil(Math.max(...bounds.map((s) => s.endMinutes)) / 60));
  const hours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i);
  const cells = Array.from({ length: CELLS_PER_HOUR }, (_, i) => i);

  return (
    <div style={{ width: 130 }}>
      {hours.map((h) => (
        <div key={h} className="flex items-center gap-1" style={{ height: ROW_HEIGHT }}>
          <span className="text-[10px] text-on-surface-variant leading-none w-8 shrink-0">
            {String(h).padStart(2, '0')}시
          </span>
          <div className="grid flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${CELLS_PER_HOUR}, 1fr)`, height: ROW_HEIGHT - 2 }}>
            {cells.map((c) => {
              const cellStart = h * 60 + c * MINUTES_PER_CELL;
              const cellEnd = cellStart + MINUTES_PER_CELL;
              const seg = cellSegment(segments, cellStart, cellEnd);
              const allowed = isAllowedAppCell(allowedAppSpans, cellStart, cellEnd);

              return (
                <div
                  key={c}
                  title={allowed ? `${seg?.subjectLabel ?? ''} · 허용앱`.trim() : seg?.subjectLabel}
                  className={!seg && !allowed ? 'bg-surface-container' : undefined}
                  style={
                    seg
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
                        : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- **확신도**: 추정 — 허용앱 구간을 “공부 기록이 있는 시간표 위에만 오버레이”하려는 의도라면 문제가 아닙니다. 그 의도는 현재 주석만으로는 확인되지 않습니다.

---

- **[낮음] 시간표 과목을 빈 문자열로 저장할 수 있어 삭제/빈칸 의미가 액션 구현에 의존함**
- **위치**: `MyPage.tsx`, 학교 시간표 편집 BottomSheet 대략 190~205줄
- **왜 문제인가**: 사용자가 과목을 지우고 저장하면 `upsertSchoolTimetableSlot(..., '')`가 호출됩니다. 액션이 빈 문자열을 delete로 처리하지 않으면 DB에는 빈 과목 행이 남습니다. 화면상으로는 빈칸처럼 보일 수 있지만, 매니저 화면·동기화·정렬에서는 “행은 있는데 과목은 빈 값”이라는 애매한 상태가 됩니다.
- **어떻게 고치는가**: 액션에 삭제 함수가 있다면 명시적으로 분기합니다.

```tsx
const subject = editingCell.subject.trim();

if (subject) {
  actions.upsertSchoolTimetableSlot(editingCell.weekday, editingCell.period, subject);
} else {
  actions.deleteSchoolTimetableSlot(editingCell.weekday, editingCell.period);
}

setEditingCell(null);
```

삭제 액션이 없다면 `upsertSchoolTimetableSlot` 구현에서 빈 문자열을 delete로 처리해야 합니다.

```ts
async function upsertSchoolTimetableSlot(weekday: number, period: number, subject: string) {
  const trimmed = subject.trim();

  if (!trimmed) {
    await deleteSchoolTimetableSlot(weekday, period);
    return;
  }

  // 기존 upsert
}
```

- **확신도**: 추정 — `upsertSchoolTimetableSlot` 구현이 필요합니다.

---

**문제를 못 찾은 영역**

`pendingPauseModel.ts`, `pendingPauseModel.test.ts`, `studentHomeModel.ts`, `studentHomeModel.test.ts`, `allowedAppUsageModel.ts`, `allowedAppUsageModel.test.ts`는 붙여진 범위 안에서는 경계 조건 주석과 테스트가 잘 맞아 있고, 별도 정확성 버그를 찾지 못했습니다.

접근성도 붙여진 범위에서는 큰 누락을 찾지 못했습니다. 달력 `aria-label`, 체크 버튼 라벨, 배너 닫기 라벨, 권한 공개 문구는 이미 처리되어 있습니다.
