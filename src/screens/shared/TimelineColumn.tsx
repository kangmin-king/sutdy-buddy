export interface TimelineSegment {
  subjectLabel: string;
  color: string;
  startMinutes: number;
  endMinutes: number;
}

const ROW_HEIGHT = 18;
const MINUTES_PER_CELL = 10;
const CELLS_PER_HOUR = 60 / MINUTES_PER_CELL;

function cellSegment(segments: TimelineSegment[], cellStart: number, cellEnd: number): TimelineSegment | undefined {
  return segments.find((s) => s.startMinutes < cellEnd && s.endMinutes > cellStart);
}

export interface AllowedAppSpan {
  startMinutes: number;
  endMinutes: number;
}

function isAllowedAppCell(spans: AllowedAppSpan[], cellStart: number, cellEnd: number): boolean {
  return spans.some((s) => s.startMinutes < cellEnd && s.endMinutes > cellStart);
}

// 열품타 타임테이블처럼, 시(가로줄)와 분(세로줄)으로 실제 나뉜 격자에 공부한 칸만 과목 색으로
// 채운다. ChecklistTimeline이 체크리스트(왼쪽)와 나란히 붙여 쓴다.
export function TimelineColumn({
  segments,
  allowedAppSpans = [],
}: {
  segments: TimelineSegment[];
  allowedAppSpans?: AllowedAppSpan[];
}) {
  // **허용앱 사용 구간도 격자의 근거로 삼는다.** 예전에는 공부 세션만 봐서,
  //  - 공부 기록이 없고 허용앱 사용만 있는 날은 통째로 "기록 없음"이 됐고,
  //  - 공부한 날이어도 그 시간대 밖의 허용앱 사용은 격자에 아예 안 들어왔다.
  // 매니저가 "이 학생이 언제 뭘 했나"를 보는 화면인데 한쪽 사실이 통째로 빠져 있었다.
  const bounds = [...segments, ...allowedAppSpans];
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
          <span className="text-[10px] text-on-surface-variant leading-none w-8 shrink-0">{String(h).padStart(2, '0')}시</span>
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
                          // 과목 색 위의 빗금은 어두운 선으로 충분하다 — 과목 색은 전부 채도가 높다.
                          backgroundImage: allowed ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0 2px, transparent 2px 4px)' : undefined,
                        }
                      : allowed
                        ? {
                            // 공부 세션 없이 허용앱만 쓴 칸. 예전에는 빈 칸과 똑같이 그려져서
                            // 세션과 겹치는 부분에서만 허용앱 사용이 보였다.
                            // 빗금을 검정으로 두면 다크 배경(32 29 57)에 묻히므로 테마 토큰으로 긋는다.
                            // 알파 0.7은 브라우저에서 실측해 고른 값이다 — 라이트 3.55:1, 다크 4.10:1로
                            // 양쪽 다 그래픽 요소 기준(3:1)을 넘는 최소값이다(0.6은 라이트가 2.88로 미달).
                            backgroundColor: 'rgb(var(--surface-container-highest))',
                            backgroundImage:
                              'repeating-linear-gradient(45deg, rgb(var(--on-surface-variant) / 0.7) 0 2px, transparent 2px 4px)',
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
