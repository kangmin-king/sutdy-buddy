import { getSubject } from '../../constants';
import { toMinutesOfDay } from '../../lib';
import VerticalStudyTimeline from '../shared/VerticalStudyTimeline';
import type { TimelineSegment } from '../shared/VerticalStudyTimeline';
import type { PlannerItem, StudySession } from '../../types';

// 열품타 스타일로 "오늘 어떤 과목을 언제 공부했는지" 보여주는 타임라인 — 실제 그리기는
// VerticalStudyTimeline(학생 캘린더 탭과 공유)이 맡고, 여기서는 관리자 데이터 모양(items +
// studySessions)을 그 컴포넌트가 받는 세그먼트 배열로 바꾸는 역할만 한다.
export default function StudyTimelineChart({
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

  return <VerticalStudyTimeline segments={segments} />;
}
