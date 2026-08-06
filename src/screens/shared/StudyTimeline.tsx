import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { TopAppBar } from '../../primitives';
import ChecklistTimeline from './ChecklistTimeline';

// `userId`가 없으면 본인 기준(state.plannerItems/studySessions), 있으면(관리자가 학생 조회 시)
// 해당 학생 기준으로 데이터를 스위칭한다 — 관리자용 학생별 세션 조회 액션이 Task 6에서 추가된 뒤
// Task 15에서 실제로 연결된다. 그 전까지는 항상 본인(state) 데이터를 사용한다.
export default function StudyTimelineScreen({ userId }: { userId?: string } = {}) {
  const { state } = useAppState();
  const [selectedDate, setSelectedDate] = React.useState(todayKey());
  const items = (state.plannerItems[selectedDate] ?? []).slice().sort((a, b) => a.order - b.order);
  const examsToday = state.examRecords.filter((e) => e.examDate === selectedDate);

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />
      <div className="mb-4 space-y-2">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-outline-variant px-3 py-2 text-sm"
        />
        {examsToday.length > 0 && (
          <p className="text-sm font-semibold text-error">{examsToday.map((e) => `📝 ${e.title} 시험일`).join(', ')}</p>
        )}
      </div>
      <ChecklistTimeline items={items} studySessions={state.studySessions} />
    </div>
  );
}
