import React from 'react';
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

const PX_PER_HOUR = 48;

// 열품타 스타일: 왼쪽에 과목별 누적 시간 목록, 오른쪽에 세로로 긴 시간대 막대 하나에 그 과목 색으로
// 공부한 구간을 표시한다. 여러 시간 행으로 쪼개던 이전 방식보다 한눈에 들어온다.
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

  const minHour = Math.max(0, Math.floor(Math.min(...segments.map((s) => s.startMinutes)) / 60));
  const maxHour = Math.min(24, Math.ceil(Math.max(...segments.map((s) => s.endMinutes)) / 60));
  const rangeStartMinutes = minHour * 60;
  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
  const totalHeight = (maxHour - minHour) * PX_PER_HOUR;

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

      <div className="flex shrink-0" style={{ width: 120 }}>
        <div className="flex flex-col justify-between pr-1.5 shrink-0" style={{ height: totalHeight }}>
          {hours.map((h) => (
            <span key={h} className="text-[10px] text-on-surface-variant leading-none">
              {String(h).padStart(2, '0')}시
            </span>
          ))}
        </div>
        <div className="relative flex-1 rounded-lg bg-surface-container" style={{ height: totalHeight }}>
          {hours.slice(1).map((h) => (
            <div key={h} className="absolute left-0 right-0 border-t border-outline-variant/30" style={{ top: (h - minHour) * PX_PER_HOUR }} />
          ))}
          {segments.map((s, idx) => {
            const top = ((s.startMinutes - rangeStartMinutes) / 60) * PX_PER_HOUR;
            const height = ((s.endMinutes - s.startMinutes) / 60) * PX_PER_HOUR;
            return (
              <div
                key={idx}
                title={s.subjectLabel}
                className={`absolute left-0.5 right-0.5 rounded ${s.deviated ? 'bg-error/80' : (BAR_CLASSES[s.color] ?? 'bg-primary/80')}`}
                style={{ top, height: Math.max(2, height) }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
