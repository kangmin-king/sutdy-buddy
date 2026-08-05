import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, sessionsToTimelineBlocks } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar } from '../../primitives';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// `userId`가 없으면 본인 기준(state.plannerItems/studySessions), 있으면(관리자가 학생 조회 시)
// 해당 학생 기준으로 데이터를 스위칭한다 — 관리자용 학생별 세션 조회 액션이 Task 6에서 추가된 뒤
// Task 15에서 실제로 연결된다. 그 전까지는 항상 본인(state) 데이터를 사용한다.
export default function StudyTimelineScreen({ userId }: { userId?: string } = {}) {
  const { state } = useAppState();
  const [selectedDate, setSelectedDate] = React.useState(todayKey());
  const items = state.plannerItems[selectedDate] ?? [];

  const entries = items.flatMap((it) =>
    (state.studySessions[it.id] ?? []).map((session) => ({ session, subjectLabel: getSubject(it.subjectId).label }))
  );
  const blocks = sessionsToTimelineBlocks(entries);

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />
      <input
        type="date"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        className="mb-4 rounded-lg border border-outline-variant px-3 py-2 text-sm"
      />
      <div className="space-y-0.5">
        {HOURS.map((h) => {
          const label = `${h.toString().padStart(2, '0')}:00`;
          const block = blocks.find((b) => b.startTime.slice(0, 2) === h.toString().padStart(2, '0'));
          return (
            <div key={h} className="flex items-center gap-2 h-6">
              <span className="text-[10px] text-on-surface-variant w-10 shrink-0">{label}</span>
              <div
                className={`flex-1 h-full rounded ${block ? (block.deviated ? 'bg-error/60' : 'bg-primary/60') : 'bg-surface-container'}`}
                title={block?.subjectLabel}
              />
            </div>
          );
        })}
      </div>
      {blocks.length === 0 && <p className="text-sm text-on-surface-variant text-center py-10">이 날은 기록이 없어요.</p>}
    </div>
  );
}
