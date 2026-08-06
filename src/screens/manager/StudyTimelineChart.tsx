import React from 'react';
import { getSubject } from '../../constants';
import { toMinutesOfDay, formatMinutes } from '../../lib';
import type { PlannerItem, StudySession } from '../../types';

// SUBJECTS(constants.ts)가 쓰는 색 토큰(primary/secondary/tertiary)만 매핑한다. Tailwind는 파일에
// 그대로 등장하는 클래스 문자열만 뽑아내므로, 동적 템플릿 문자열(`bg-${color}`) 대신 이렇게 완전한
// 문자열을 나열해야 빌드에서 실제로 생성된다.
const BAR_CLASSES: Record<string, string> = {
  primary: 'bg-primary/80',
  secondary: 'bg-secondary/80',
  tertiary: 'bg-tertiary/80',
};
const DOT_CLASSES: Record<string, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  tertiary: 'bg-tertiary',
};

interface Segment {
  subjectId: string;
  subjectLabel: string;
  color: string;
  startMinutes: number;
  endMinutes: number;
  deviated: boolean;
}

// 열품타 스타일로 "오늘 어떤 과목을 언제 공부했는지" 보여주는 타임라인. 위쪽 범례에 과목별 누적
// 시간, 아래쪽 시간대별 막대에 실제 공부한 구간을 과목 색으로 표시한다.
export default function StudyTimelineChart({
  items,
  studySessions,
}: {
  items: PlannerItem[];
  studySessions: Record<string, StudySession[]>;
}) {
  const nowIso = new Date().toISOString();

  const segments: Segment[] = [];
  for (const item of items) {
    const subject = getSubject(item.subjectId);
    for (const session of studySessions[item.id] ?? []) {
      const startMinutes = toMinutesOfDay(session.startedAt);
      const endMinutes = toMinutesOfDay(session.endedAt ?? nowIso);
      if (endMinutes <= startMinutes) continue; // 자정을 넘긴 세션 등 예외 케이스는 표시하지 않는다.
      segments.push({ subjectId: item.subjectId, subjectLabel: subject.label, color: subject.color, startMinutes, endMinutes, deviated: session.deviated });
    }
  }

  if (segments.length === 0) {
    return <p className="text-sm text-on-surface-variant text-center py-6">오늘 아직 학습 기록이 없어요.</p>;
  }

  const totalsBySubject = new Map<string, { label: string; color: string; minutes: number }>();
  for (const seg of segments) {
    const minutes = seg.endMinutes - seg.startMinutes;
    const prev = totalsBySubject.get(seg.subjectId);
    if (prev) prev.minutes += minutes;
    else totalsBySubject.set(seg.subjectId, { label: seg.subjectLabel, color: seg.color, minutes });
  }

  const minHour = Math.max(0, Math.floor(Math.min(...segments.map((s) => s.startMinutes)) / 60));
  const maxHour = Math.min(23, Math.ceil(Math.max(...segments.map((s) => s.endMinutes)) / 60));
  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
        {Array.from(totalsBySubject.values()).map((t) => (
          <div key={t.label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_CLASSES[t.color] ?? 'bg-primary'}`} />
            <span className="text-xs font-semibold">{t.label}</span>
            <span className="text-xs text-on-surface-variant">{formatMinutes(Math.round(t.minutes))}</span>
          </div>
        ))}
      </div>
      <div className="space-y-0.5">
        {hours.map((h) => {
          const hourStart = h * 60;
          const hourEnd = hourStart + 60;
          const hourSegments = segments.filter((s) => s.startMinutes < hourEnd && s.endMinutes > hourStart);
          return (
            <div key={h} className="flex items-center gap-2 h-6">
              <span className="text-[10px] text-on-surface-variant w-9 shrink-0">{String(h).padStart(2, '0')}시</span>
              <div className="flex-1 h-full rounded bg-surface-container relative overflow-hidden">
                {hourSegments.map((s, idx) => {
                  const left = Math.max(0, s.startMinutes - hourStart);
                  const right = Math.min(60, s.endMinutes - hourStart);
                  return (
                    <div
                      key={idx}
                      title={s.subjectLabel}
                      className={`absolute top-0 h-full ${s.deviated ? 'bg-error/70' : (BAR_CLASSES[s.color] ?? 'bg-primary/80')}`}
                      style={{ left: `${(left / 60) * 100}%`, width: `${((right - left) / 60) * 100}%` }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
