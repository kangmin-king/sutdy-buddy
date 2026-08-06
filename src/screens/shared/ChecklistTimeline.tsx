import { getSubject } from '../../constants';
import { toMinutesOfDay } from '../../lib';
import { TimelineColumn } from './TimelineColumn';
import type { TimelineSegment } from './TimelineColumn';
import type { PlannerItem, StudySession } from '../../types';

const DOT_CLASSES: Record<string, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  tertiary: 'bg-tertiary',
};

// 모트모트 다이어리 속지처럼, 왼쪽에 할 일 체크리스트(과목 색 점 + 내용 + 완료 표시)를 두고
// 오른쪽에 시간대별 타임테이블을 붙여서 "무엇을 언제 했는지"를 한 화면에서 보게 한다.
// 관리자 홈(오늘 고정)과 학생 본인 캘린더(날짜 선택 가능) 둘 다 이 컴포넌트를 쓴다.
export default function ChecklistTimeline({
  items,
  studySessions,
}: {
  items: PlannerItem[];
  studySessions: Record<string, StudySession[]>;
}) {
  const nowIso = new Date().toISOString();

  const segments: TimelineSegment[] = [];
  for (const item of items) {
    const subject = getSubject(item.subjectId);
    for (const session of studySessions[item.id] ?? []) {
      const startMinutes = toMinutesOfDay(session.startedAt);
      const endMinutes = toMinutesOfDay(session.endedAt ?? nowIso);
      if (endMinutes <= startMinutes) continue; // 자정을 넘긴 세션 등 예외 케이스는 표시하지 않는다.
      segments.push({ subjectLabel: subject.label, color: subject.color, startMinutes, endMinutes, deviated: session.deviated });
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-on-surface-variant text-center py-6">계획된 항목이 없어요.</p>;
  }

  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 space-y-1.5">
        {items.map((item) => {
          const subject = getSubject(item.subjectId);
          return (
            <div key={item.id} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLASSES[subject.color] ?? 'bg-primary'}`} />
              <p className="text-xs flex-1 min-w-0 truncate">
                <span className="font-bold">{subject.label}</span>{' '}
                <span className="text-on-surface-variant">{item.material || item.pageRange || '할 일'}</span>
              </p>
              <span
                className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                  item.status === 'completed' ? 'bg-primary border-primary' : 'border-outline-variant'
                }`}
              />
            </div>
          );
        })}
      </div>
      <TimelineColumn segments={segments} />
    </div>
  );
}
