import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
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

  const studentExams = state.examRecords.filter((e) => e.studentId === studentId);
  const selectedExam = studentExams.find((e) => e.id === selectedExamId) ?? null;
  const subjectsForExam = state.examSubjects.filter((s) => s.examId === selectedExamId);

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
            {subjectsForExam.map((subject) => (
              <Card key={subject.id}>
                <p className="text-sm font-bold">{getSubject(subject.subjectId).label}</p>
                <p className="text-xs text-on-surface-variant">
                  {subject.targetGrade} · {subject.targetScore} · {subject.targetRank}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
