import React from 'react';
import { getSubject, resolveSubjectColor, SUBJECT_COLOR_PALETTE } from '../../constants';
import { toMinutesOfDay, formatMinutes } from '../../lib';
import { TimelineColumn } from './TimelineColumn';
import type { TimelineSegment } from './TimelineColumn';
import { BottomSheet } from '../../primitives';
import type { PlannerItem, StudySession, SubjectId } from '../../types';

// 모트모트 다이어리 속지처럼, 왼쪽에 할 일 체크리스트(과목 색 점 + 내용 + 완료 표시)를 두고
// 오른쪽에 시간대별 타임테이블을 붙여서 "무엇을 언제 했는지"를 한 화면에서 보게 한다.
// 관리자 홈(오늘 고정)과 학생 본인 캘린더(날짜 선택 가능) 둘 다 이 컴포넌트를 쓴다.
// editable이 있으면(=본인 데이터를 보는 화면) 왼쪽 점을 눌러 과목 색을 직접 고를 수 있다.
export default function ChecklistTimeline({
  items,
  studySessions,
  customColors,
  editable = false,
  onChangeSubjectColor,
}: {
  items: PlannerItem[];
  studySessions: Record<string, StudySession[]>;
  customColors?: Record<string, string>;
  editable?: boolean;
  onChangeSubjectColor?: (subjectId: SubjectId, color: string) => void;
}) {
  const [pickerSubjectId, setPickerSubjectId] = React.useState<SubjectId | null>(null);

  const segments: TimelineSegment[] = [];
  const elapsedSecondsByItem: Record<string, number> = {};
  for (const item of items) {
    const subject = getSubject(item.subjectId);
    const color = resolveSubjectColor(item.subjectId, customColors);
    let elapsedSeconds = 0;
    for (const session of studySessions[item.id] ?? []) {
      // 아직 끝나지 않은(정지를 못 받아 endedAt이 계속 비어 있는) 세션은 지금 이 순간까지로
      // 늘려 계산하지 않는다 — 브라우저가 닫히는 등으로 정지가 누락된 세션이 "몇 시간째 진행
      // 중"으로 잘못 보이는 걸 막는다. 실제 진행 중인 타이머는 홈 화면이 따로 실시간으로 보여준다.
      if (session.endedAt == null || session.durationSeconds == null) continue;
      const startedAtMs = Date.parse(session.startedAt);
      const endedAtMs = Date.parse(session.endedAt);
      if (endedAtMs <= startedAtMs) continue; // 실제로 끝난 시각이 시작보다 앞선(잘못된) 기록만 건너뛴다.
      elapsedSeconds += session.durationSeconds;
      const startMinutes = toMinutesOfDay(session.startedAt);
      // 시작~종료가 1분 안에 끝나면 분 단위로 내림했을 때 startMinutes와 같아진다. 실제로는
      // 유효한 기록이므로 통째로 버리지 않고 최소 한 칸(1분)은 보이게 한다.
      const endMinutes = Math.max(startMinutes + 1, toMinutesOfDay(session.endedAt));
      segments.push({ subjectLabel: subject.label, color, startMinutes, endMinutes, deviated: session.deviated });
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
          const color = resolveSubjectColor(item.subjectId, customColors);
          const elapsedSeconds = elapsedSecondsByItem[item.id] ?? 0;
          return (
            <div key={item.id} className="flex items-center gap-2">
              {editable ? (
                <button onClick={() => setPickerSubjectId(item.subjectId)} className="shrink-0">
                  <span className="block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                </button>
              ) : (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              )}
              <p className="flex-1 min-w-0 truncate">
                <span className="text-base font-bold">{subject.label}</span>{' '}
                <span className="text-sm text-on-surface-variant">{item.material || item.pageRange || '할 일'}</span>
                {elapsedSeconds > 0 && (
                  <span className="text-sm text-primary font-semibold ml-1">{formatMinutes(Math.round(elapsedSeconds / 60))}</span>
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

      <BottomSheet
        open={pickerSubjectId !== null}
        onClose={() => setPickerSubjectId(null)}
        title={pickerSubjectId ? `${getSubject(pickerSubjectId).label} 색 고르기` : undefined}
      >
        <div className="grid grid-cols-4 gap-3">
          {SUBJECT_COLOR_PALETTE.map((swatch) => (
            <button
              key={swatch}
              onClick={() => {
                if (pickerSubjectId) onChangeSubjectColor?.(pickerSubjectId, swatch);
                setPickerSubjectId(null);
              }}
              className="w-full aspect-square rounded-full border-2 border-surface-container-lowest shadow-card"
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
