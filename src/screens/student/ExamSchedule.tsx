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
  const [openExamId, setOpenExamId] = React.useState<string | null>(exams[0]?.id ?? null);

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
