import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { getSubject, SUBJECTS } from '../../constants';
import { TopAppBar, Card, Button, Icon, SectionTitle, ChipGroup, TextField } from '../../primitives';
import ExamSchedule from './ExamSchedule';
import ChecklistTimeline from '../shared/ChecklistTimeline';
import type { SubjectId } from '../../types';

export default function StudentPlannerScreen() {
  const { state, actions } = useAppState();
  const today = todayKey();
  const todayItems = (state.plannerItems[today] ?? []).slice().sort((a, b) => a.order - b.order);
  const items = todayItems.filter((i) => i.source === 'self');

  const [showForm, setShowForm] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [task, setTask] = React.useState('');
  const [startTime, setStartTime] = React.useState('09:00');
  const [endTime, setEndTime] = React.useState('');

  const addTask = () => {
    if (!task.trim()) return;
    actions.addPlannerItem(today, {
      date: today,
      subjectId,
      startTime,
      studyType: null,
      material: task,
      unit: '',
      pageRange: '',
      endTime: endTime || null,
      difficulty: null,
      restPattern: null,
      mustDo: false,
      status: 'planned',
      actualMinutes: null,
      understanding: null,
      partialReason: null,
      incompleteReason: null,
      source: 'self',
      homeworkAssignmentId: null,
      examSubjectRangeId: null,
    });
    setTask('');
    setShowForm(false);
  };

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />
      <ExamSchedule />
      <SectionTitle
        action={
          <button onClick={() => setShowForm((s) => !s)} className="text-primary flex items-center gap-1 text-xs font-semibold">
            <Icon name="add_circle" className="!text-[18px]" /> 계획 추가
          </button>
        }
      >
        스터디플래너
      </SectionTitle>

      {showForm && (
        <Card className="mb-4 space-y-3">
          <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
          <TextField label="뭐 할지" value={task} onChange={setTask} placeholder="예: 수학 익힘책 2단원" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="시작" type="time" value={startTime} onChange={setStartTime} />
            <TextField label="종료" type="time" value={endTime} onChange={setEndTime} />
          </div>
          <Button className="w-full" onClick={addTask}>
            추가하기
          </Button>
        </Card>
      )}

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-10">아직 스스로 짠 계획이 없어요.</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-xl bg-surface-container-high px-4 py-3">
            <div>
              <p className="text-sm font-semibold">
                {getSubject(it.subjectId).label} · {it.material}
              </p>
              <p className="text-xs text-on-surface-variant">
                {it.startTime}
                {it.endTime ? ` - ${it.endTime}` : ''}
              </p>
            </div>
            <button onClick={() => actions.deletePlannerItem(today, it.id)} className="text-on-surface-variant">
              <Icon name="close" className="!text-[18px]" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <SectionTitle>오늘 타임라인</SectionTitle>
        <ChecklistTimeline items={todayItems} studySessions={state.studySessions} />
      </div>
    </div>
  );
}
