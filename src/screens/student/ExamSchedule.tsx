import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, daysBetween } from '../../lib';
import { getSubject } from '../../constants';
import { Card, SectionTitle } from '../../primitives';

function ddayLabel(examDate: string, today: string): string {
  const diff = daysBetween(today, examDate);
  if (diff === 0) return 'D-DAY';
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}

// 선생님/학부모가 진도관리 탭에서 등록한 시험 일정·과목별 목표·교재 범위를 학생이 읽기 전용으로 본다.
export default function ExamSchedule() {
  const { state } = useAppState();
  const today = todayKey();
  const exams = state.examRecords.slice().sort((a, b) => (a.examDate < b.examDate ? -1 : 1));
  // "첫 시험은 펼쳐 둔다"를 초기값으로만 정하면, 첫 렌더에 시험이 비어 있는 경우 나중에
  // 목록이 채워져도 아무것도 안 열린다. 지금 구조에서는 ExamSchedule이 loadAll이 끝난 뒤에야
  // 마운트되므로 그 경로가 실제로 열리지는 않는다 — 다만 위쪽에서 로딩 순서가 바뀌면
  // 조용히 깨지는 자리라 목록이 바뀔 때마다 다시 맞춘다.
  const [openExamId, setOpenExamId] = React.useState<string | null>(exams[0]?.id ?? null);
  const examIds = exams.map((e) => e.id).join('|');
  React.useEffect(() => {
    // 열어둔 시험이 목록에서 사라졌을 때(삭제 등)도 첫 시험으로 되돌린다.
    setOpenExamId((current) => (current && exams.some((e) => e.id === current) ? current : (exams[0]?.id ?? null)));
    // exams 배열은 매 렌더 새로 만들어지므로 id 문자열로 의존성을 줄인다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examIds]);

  if (exams.length === 0) return null;

  return (
    <div className="mb-5">
      <SectionTitle>시험 일정</SectionTitle>
      <div className="space-y-2">
        {exams.map((exam) => {
          const subjects = state.examSubjects.filter((s) => s.examId === exam.id);
          const isOpen = openExamId === exam.id;
          return (
            <Card key={exam.id} className="!p-0 overflow-hidden">
              <button
                onClick={() => setOpenExamId(isOpen ? null : exam.id)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-bold">
                    {exam.title} {exam.isMain && '⭐'}
                  </p>
                  <p className="text-xs text-on-surface-variant">{exam.examDate}</p>
                </div>
                <span className="text-sm font-bold text-primary shrink-0">{ddayLabel(exam.examDate, today)}</span>
              </button>

              {isOpen && (
                <div className="px-4 pb-3 pt-1 border-t border-outline-variant/40 space-y-2.5">
                  {subjects.length === 0 && <p className="text-xs text-on-surface-variant py-1">등록된 과목별 목표가 없어요.</p>}
                  {subjects.map((subject) => {
                    const ranges = state.examSubjectRanges.filter((r) => r.examSubjectId === subject.id);
                    return (
                      <div key={subject.id}>
                        <p className="text-sm font-semibold">{getSubject(subject.subjectId).label}</p>
                        {(subject.targetGrade || subject.targetScore || subject.targetRank) && (
                          <p className="text-xs text-on-surface-variant">
                            {[subject.targetGrade, subject.targetScore, subject.targetRank].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {ranges.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {ranges.map((range) => (
                              <li key={range.id} className="text-xs text-on-surface-variant">
                                · {range.material} — {range.rangeLabel}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
