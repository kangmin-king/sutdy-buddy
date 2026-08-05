import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, getTutoringDaysInRange, addDaysToKey } from '../../lib';
import { SUBJECTS, getSubject } from '../../constants';
import { Card, Button, TextField, ToggleSwitch, ChipGroup, SectionTitle } from '../../primitives';
import type { SubjectId } from '../../types';

export default function ManagerProgressScreen({ studentId }: { studentId: string }) {
  const { state, actions } = useAppState();
  const [showExamForm, setShowExamForm] = React.useState(false);
  const [examTitle, setExamTitle] = React.useState('');
  const [examDate, setExamDate] = React.useState(todayKey());
  const [examIsMain, setExamIsMain] = React.useState(false);
  const [selectedExamId, setSelectedExamId] = React.useState<string | null>(null);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [targetGrade, setTargetGrade] = React.useState('');
  const [targetScore, setTargetScore] = React.useState('');
  const [targetRank, setTargetRank] = React.useState('');
  const [rangeSubjectId, setRangeSubjectId] = React.useState<string | null>(null); // which ExamSubject is registering a range
  const [material, setMaterial] = React.useState('');
  const [startPage, setStartPage] = React.useState('');
  const [endPage, setEndPage] = React.useState('');
  const [selectedDates, setSelectedDates] = React.useState<string[]>([]);

  const studentExams = state.examRecords.filter((e) => e.studentId === studentId);
  const selectedExam = studentExams.find((e) => e.id === selectedExamId) ?? null;
  const subjectsForExam = state.examSubjects.filter((s) => s.examId === selectedExamId);

  const schedule = state.tutoringSchedules.find((sch) => sch.studentId === studentId);
  const scheduleExceptions = state.tutoringScheduleExceptions.filter((ex) => ex.studentId === studentId);
  const rangeStart = todayKey();
  const rangeEnd = addDaysToKey(rangeStart, 13);
  const tutoringDays = new Set(getTutoringDaysInRange(schedule?.weekdays ?? [], scheduleExceptions, rangeStart, rangeEnd));
  const miniCalendarDates = React.useMemo(() => {
    const dates: string[] = [];
    let cursor = rangeStart;
    for (let i = 0; i < 14; i++) {
      dates.push(cursor);
      cursor = addDaysToKey(cursor, 1);
    }
    return dates;
  }, [rangeStart]);

  const toggleDate = (date: string) => {
    setSelectedDates((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]));
  };

  const submitRange = () => {
    if (!rangeSubjectId || !material.trim() || !startPage.trim() || !endPage.trim() || selectedDates.length === 0) return;
    const subject = subjectsForExam.find((s) => s.id === rangeSubjectId);
    if (!subject) return;
    actions.registerHomeworkRange(studentId, rangeSubjectId, {
      subjectId: subject.subjectId,
      material,
      startPage: Number(startPage),
      endPage: Number(endPage),
      selectedDates,
    });
    setMaterial('');
    setStartPage('');
    setEndPage('');
    setSelectedDates([]);
    setRangeSubjectId(null);
  };

  const submitExam = async () => {
    if (!examTitle.trim()) return;
    const id = await actions.createExamRecord(studentId, { title: examTitle, examDate, isMain: examIsMain });
    setExamTitle('');
    setExamIsMain(false);
    setShowExamForm(false);
    setSelectedExamId(id);
  };

  const submitSubject = () => {
    if (!selectedExamId || !targetGrade.trim()) return;
    actions.addExamSubject(selectedExamId, { subjectId, targetGrade, targetScore, targetRank });
    setTargetGrade('');
    setTargetScore('');
    setTargetRank('');
  };

  return (
    <div className="px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <SectionTitle
        action={
          <button onClick={() => setShowExamForm((s) => !s)} className="text-primary text-xs font-semibold">
            + 시험 추가
          </button>
        }
      >
        시험/평가
      </SectionTitle>

      {showExamForm && (
        <Card className="mb-4 space-y-3">
          <TextField label="시험명" value={examTitle} onChange={setExamTitle} placeholder="예: 2학기 중간고사" />
          <TextField label="시험일" type="date" value={examDate} onChange={setExamDate} />
          <ToggleSwitch label="메인 시험으로 지정" checked={examIsMain} onChange={setExamIsMain} />
          <Button className="w-full" onClick={submitExam}>
            추가하기
          </Button>
        </Card>
      )}

      <div className="flex gap-2 overflow-x-auto mb-4">
        {studentExams.length === 0 && <p className="text-sm text-on-surface-variant py-2">등록된 시험이 없어요.</p>}
        {studentExams.map((exam) => (
          <button
            key={exam.id}
            onClick={() => setSelectedExamId(exam.id)}
            className={`shrink-0 rounded-xl px-4 py-3 text-left ${
              exam.id === selectedExamId ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest shadow-card'
            }`}
          >
            <p className="text-sm font-bold">
              {exam.title} {exam.isMain && '⭐'}
            </p>
            <p className="text-xs opacity-80">{exam.examDate}</p>
          </button>
        ))}
      </div>

      {selectedExam && (
        <>
          <SectionTitle>과목별 목표</SectionTitle>
          <Card className="mb-4 space-y-3">
            <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
            <div className="grid grid-cols-3 gap-2">
              <TextField label="목표 등급" value={targetGrade} onChange={setTargetGrade} placeholder="1등급" />
              <TextField label="목표 점수" value={targetScore} onChange={setTargetScore} placeholder="90점" />
              <TextField label="목표 등수" value={targetRank} onChange={setTargetRank} placeholder="반 3등" />
            </div>
            <Button className="w-full" onClick={submitSubject}>
              과목 추가
            </Button>
          </Card>

          <div className="space-y-2">
            {subjectsForExam.map((subject) => {
              const ranges = state.examSubjectRanges.filter((r) => r.examSubjectId === subject.id);
              const isRegistering = rangeSubjectId === subject.id;
              return (
                <Card key={subject.id} className="mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">{getSubject(subject.subjectId).label}</p>
                      <p className="text-xs text-on-surface-variant">
                        {subject.targetGrade} · {subject.targetScore} · {subject.targetRank}
                      </p>
                    </div>
                    <button
                      onClick={() => setRangeSubjectId(isRegistering ? null : subject.id)}
                      className="text-xs font-semibold text-primary"
                    >
                      교재 등록
                    </button>
                  </div>

                  {isRegistering && (
                    <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-3">
                      <TextField label="교재명" value={material} onChange={setMaterial} placeholder="예: 쎈 수학 (상)" />
                      <div className="grid grid-cols-2 gap-2">
                        <TextField label="시작 페이지" type="number" value={startPage} onChange={setStartPage} placeholder="10" />
                        <TextField label="끝 페이지" type="number" value={endPage} onChange={setEndPage} placeholder="50" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">공부할 날짜 선택</label>
                        <div className="grid grid-cols-7 gap-1.5">
                          {miniCalendarDates.map((date) => {
                            const isTutoringDay = tutoringDays.has(date);
                            const isSelected = selectedDates.includes(date);
                            const day = Number(date.split('-')[2]);
                            return (
                              <button
                                key={date}
                                onClick={() => toggleDate(date)}
                                className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center ${
                                  isSelected
                                    ? 'bg-primary text-on-primary'
                                    : isTutoringDay
                                      ? 'bg-tertiary-container/40 text-on-surface'
                                      : 'bg-surface-container text-on-surface-variant'
                                }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-on-surface-variant mt-1">진한 표시 칸 = 과외 날짜</p>
                      </div>
                      <Button className="w-full" onClick={submitRange}>
                        {selectedDates.length}일에 나눠서 등록
                      </Button>
                    </div>
                  )}

                  {ranges.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-1.5">
                      {ranges.map((r) => (
                        <p key={r.id} className="text-xs text-on-surface-variant">
                          {r.material} · {r.rangeLabel} · {r.assignedDates.join(', ')}
                        </p>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
