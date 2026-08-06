import { getSubject } from '../../constants';
import { toMinutesOfDay, formatMinutes } from '../../lib';
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
  const elapsedSecondsByItem: Record<string, number> = {};
  for (const item of items) {
    const subject = getSubject(item.subjectId);
    let elapsedSeconds = 0;
    for (const session of studySessions[item.id] ?? []) {
      const endedAtMs = Date.parse(session.endedAt ?? nowIso);
      const startedAtMs = Date.parse(session.startedAt);
      if (endedAtMs <= startedAtMs) continue; // 실제로 끝난 시각이 시작보다 앞선(잘못된) 기록만 건너뛴다.
      elapsedSeconds += Math.round((endedAtMs - startedAtMs) / 1000);
      const startMinutes = toMinutesOfDay(session.startedAt);
      // 시작~종료가 1분 안에 끝나면 분 단위로 내림했을 때 startMinutes와 같아진다. 실제로는
      // 유효한 기록이므로 통째로 버리지 않고 최소 한 칸(1분)은 보이게 한다.
      const endMinutes = Math.max(startMinutes + 1, toMinutesOfDay(session.endedAt ?? nowIso));
      segments.push({ subjectLabel: subject.label, color: subject.color, startMinutes, endMinutes, deviated: session.deviated });
    }
    elapsedSecondsByItem[item.id] = elapsedSeconds;
  }

  if (items.length === 0) {
    return <p className="text-sm text-on-surface-variant text-center py-6">계획된 항목이 없어요.</p>;
  }

  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 space-y-1.5">
        {items.map((item) => {
          const subject = getSubject(item.subjectId);
          const elapsedSeconds = elapsedSecondsByItem[item.id] ?? 0;
          return (
            <div key={item.id} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLASSES[subject.color] ?? 'bg-primary'}`} />
              <p className="text-xs flex-1 min-w-0 truncate">
                <span className="font-bold">{subject.label}</span>{' '}
                <span className="text-on-surface-variant">{item.material || item.pageRange || '할 일'}</span>
                {elapsedSeconds > 0 && (
                  <span className="text-primary font-semibold ml-1">{formatMinutes(Math.round(elapsedSeconds / 60))}</span>
                )}
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
