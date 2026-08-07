// SUBJECTS(constants.ts)의 색 토큰(primary/secondary/tertiary)만 쓴다. Tailwind는 파일에 그대로
// 등장하는 클래스 문자열만 뽑아내므로 동적 템플릿 문자열 대신 완전한 문자열을 나열한다.
const BAR_CLASSES: Record<string, string> = {
  primary: 'bg-primary/80',
  secondary: 'bg-secondary/80',
  tertiary: 'bg-tertiary/80',
  rose: 'bg-rose-500/80',
  amber: 'bg-amber-500/80',
  slate: 'bg-slate-500/80',
};

export interface TimelineSegment {
  subjectLabel: string;
  color: string;
  startMinutes: number;
  endMinutes: number;
  deviated: boolean;
}

const ROW_HEIGHT = 18;
const MINUTES_PER_CELL = 10;
const CELLS_PER_HOUR = 60 / MINUTES_PER_CELL;

function cellSegment(segments: TimelineSegment[], cellStart: number, cellEnd: number): TimelineSegment | undefined {
  return segments.find((s) => s.startMinutes < cellEnd && s.endMinutes > cellStart);
}

// 열품타 타임테이블처럼, 시(가로줄)와 분(세로줄)으로 실제 나뉜 격자에 공부한 칸만 과목 색으로
// 채운다. ChecklistTimeline이 체크리스트(왼쪽)와 나란히 붙여 쓴다.
export function TimelineColumn({ segments }: { segments: TimelineSegment[] }) {
  if (segments.length === 0) {
    return <p className="text-xs text-on-surface-variant text-center py-6">기록 없음</p>;
  }

  const minHour = Math.max(0, Math.floor(Math.min(...segments.map((s) => s.startMinutes)) / 60));
  const maxHour = Math.min(24, Math.ceil(Math.max(...segments.map((s) => s.endMinutes)) / 60));
  const hours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i);
  const cells = Array.from({ length: CELLS_PER_HOUR }, (_, i) => i);

  return (
    <div style={{ width: 130 }}>
      {hours.map((h) => (
        <div key={h} className="flex items-center gap-1" style={{ height: ROW_HEIGHT }}>
          <span className="text-[10px] text-on-surface-variant leading-none w-8 shrink-0">{String(h).padStart(2, '0')}시</span>
          <div className="grid flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${CELLS_PER_HOUR}, 1fr)`, height: ROW_HEIGHT - 2 }}>
            {cells.map((c) => {
              const cellStart = h * 60 + c * MINUTES_PER_CELL;
              const cellEnd = cellStart + MINUTES_PER_CELL;
              const seg = cellSegment(segments, cellStart, cellEnd);
              return (
                <div
                  key={c}
                  title={seg?.subjectLabel}
                  className={seg ? (seg.deviated ? 'bg-error/80' : (BAR_CLASSES[seg.color] ?? 'bg-primary/80')) : 'bg-surface-container'}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
