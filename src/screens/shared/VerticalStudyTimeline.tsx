import { formatMinutes } from '../../lib';

// SUBJECTS(constants.ts)의 색 토큰(primary/secondary/tertiary)만 쓴다. Tailwind는 파일에 그대로
// 등장하는 클래스 문자열만 뽑아내므로 동적 템플릿 문자열 대신 완전한 문자열을 나열한다.
const DOT_CLASSES: Record<string, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  tertiary: 'bg-tertiary',
};
const BAR_CLASSES: Record<string, string> = {
  primary: 'bg-primary/80',
  secondary: 'bg-secondary/80',
  tertiary: 'bg-tertiary/80',
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
// 채운다. 체크리스트(왼쪽)와 나란히 쓰라고 분리해뒀다 — ManagerHome은 실제 오늘 숙제 목록을
// 왼쪽에 놓고 이 컴포넌트만 오른쪽에 붙여 쓰고, 할 일 목록이 따로 없는 화면은
// VerticalStudyTimeline(과목별 합계 목록 포함) 쪽을 통째로 쓴다.
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
          <span className="text-[9px] text-on-surface-variant leading-none w-8 shrink-0">{String(h).padStart(2, '0')}시</span>
          <div className="grid flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${CELLS_PER_HOUR}, 1fr)`, height: ROW_HEIGHT - 2 }}>
            {cells.map((c) => {
              const cellStart = h * 60 + c * MINUTES_PER_CELL;
              const cellEnd = cellStart + MINUTES_PER_CELL;
              const seg = cellSegment(segments, cellStart, cellEnd);
              return (
                <div
                  key={c}
                  title={seg?.subjectLabel}
                  className={
                    seg
                      ? seg.deviated
                        ? 'bg-error/80'
                        : (BAR_CLASSES[seg.color] ?? 'bg-primary/80')
                      : 'bg-surface-container'
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

// 과목별 합계 목록 + TimelineColumn을 같이 쓰는 버전. 체크리스트가 따로 없는 화면(학생 본인 캘린더
// 탭)에서 쓴다.
export default function VerticalStudyTimeline({ segments }: { segments: TimelineSegment[] }) {
  if (segments.length === 0) {
    return <p className="text-sm text-on-surface-variant text-center py-10">이 날은 기록이 없어요.</p>;
  }

  const totalsBySubject = new Map<string, { label: string; color: string; minutes: number }>();
  for (const seg of segments) {
    const minutes = seg.endMinutes - seg.startMinutes;
    const prev = totalsBySubject.get(seg.subjectLabel);
    if (prev) prev.minutes += minutes;
    else totalsBySubject.set(seg.subjectLabel, { label: seg.subjectLabel, color: seg.color, minutes });
  }
  const totals = Array.from(totalsBySubject.values()).sort((a, b) => b.minutes - a.minutes);

  return (
    <div className="flex gap-3">
      <div className="flex-1 min-w-0 space-y-2">
        {totals.map((t) => (
          <div key={t.label} className="flex items-center gap-2 rounded-xl bg-surface-container-lowest px-3 py-2 shadow-card">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_CLASSES[t.color] ?? 'bg-primary'}`} />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{t.label}</p>
              <p className="text-[11px] text-on-surface-variant">{formatMinutes(Math.round(t.minutes))}</p>
            </div>
          </div>
        ))}
      </div>
      <TimelineColumn segments={segments} />
    </div>
  );
}
