import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { SUBJECTS } from '../../constants';
import { BackBar, Card, Button, ChipGroup, TextField, SectionTitle } from '../../primitives';
import type { SubjectId } from '../../types';

export default function ManagerHomeworkFormScreen({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const { state, actions } = useAppState();
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [material, setMaterial] = React.useState('');
  const [amountPerDay, setAmountPerDay] = React.useState('');
  const [startDate, setStartDate] = React.useState(todayKey());
  const [endDate, setEndDate] = React.useState(todayKey());

  const studentAssignments = state.homeworkAssignments.filter((a) => a.studentId === studentId);

  const submit = () => {
    if (!material.trim() || !amountPerDay.trim()) return;
    actions.createHomeworkAssignment(studentId, { subjectId, material, amountPerDay, startDate, endDate });
    setMaterial('');
    setAmountPerDay('');
  };

  return (
    <div className="px-5 pt-2 pb-10">
      <BackBar title="숙제 관리" onBack={onBack} />

      <Card className="mt-3 mb-5 space-y-3">
        <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
        <TextField label="문제집/자료" value={material} onChange={setMaterial} placeholder="예: 쎈 수학 (상)" />
        <TextField label="하루 분량" value={amountPerDay} onChange={setAmountPerDay} placeholder="예: 10페이지" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="시작일" type="date" value={startDate} onChange={setStartDate} />
          <TextField label="종료일" type="date" value={endDate} onChange={setEndDate} />
        </div>
        <Button className="w-full" onClick={submit}>숙제 등록</Button>
      </Card>

      <SectionTitle>등록된 숙제</SectionTitle>
      <div className="space-y-2">
        {studentAssignments.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">등록된 숙제가 없어요.</p>}
        {studentAssignments.map((a) => (
          <div key={a.id} className="rounded-xl bg-surface-container-high px-4 py-3">
            <p className="text-sm font-semibold">{a.material} · {a.amountPerDay}</p>
            <p className="text-xs text-on-surface-variant">{a.startDate} ~ {a.endDate}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
