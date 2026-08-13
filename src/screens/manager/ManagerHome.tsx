import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { useConfirm } from '../../primitives';
import { getSubject } from '../../constants';
import PlannerItemRow from './PlannerItemRow';
import ChecklistTimeline from '../shared/ChecklistTimeline';

export default function ManagerHomeScreen({ studentId }: { studentId: string }) {
  const { state, actions } = useAppState();
  const { confirm, confirmDialog } = useConfirm();
  const today = todayKey();

  React.useEffect(() => {
    actions.loadStudentPlannerItems(studentId);
    actions.loadSentHomeworkProposals(studentId);
    // studentId 바뀔 때만 다시 불러온다 — actions는 매 렌더 재생성되므로 deps에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const items = (state.studentPlannerItems[studentId]?.[today] ?? []).slice().sort((a, b) => a.order - b.order);
  const homeworkItems = items.filter((it) => it.source === 'homework');
  const selfItems = items.filter((it) => it.source === 'self');
  const studentProfile = state.managedStudents.find((s) => s.id === studentId);
  const sentProposals = state.sentHomeworkProposals[studentId] ?? [];
  const statusLabel = { pending: '대기중', accepted: '수락됨', rejected: '거절됨' } as const;
  const statusColor = { pending: 'text-tertiary', accepted: 'text-secondary', rejected: 'text-error' } as const;

  return (
    <div className="px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <h2 className="text-base font-bold mt-2 mb-2">오늘 학습 타임라인</h2>
      <ChecklistTimeline items={items} studySessions={state.studySessions} customColors={studentProfile?.subjectColors} />

      <h2 className="text-base font-bold mt-6 mb-2">오늘 숙제</h2>
      {homeworkItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">오늘 등록된 숙제가 없어요.</p>}
      {homeworkItems.map((item) => (
        <PlannerItemRow
          key={item.id}
          item={item}
          onSaveAmount={(value) => actions.updateHomeworkAmountForDate(studentId, item.id, today, item.examSubjectRangeId, value)}
          onDelete={async () => {
            if (await confirm('이 숙제를 삭제할까요?')) actions.deleteStudentHomeworkItem(studentId, today, item.id);
          }}
        />
      ))}

      {sentProposals.length > 0 && (
        <>
          <h2 className="text-base font-bold mt-6 mb-2">내가 제안한 숙제</h2>
          <div className="space-y-2">
            {sentProposals.map((p) => (
              <div key={p.id} className="rounded-xl bg-surface-container-high px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {getSubject(p.subjectId).label} · {p.material || p.pageRange || '할 일'}
                  </p>
                  <p className="text-xs text-on-surface-variant">{p.date}</p>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${statusColor[p.status]}`}>{statusLabel[p.status]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="text-base font-bold mt-6 mb-2">오늘 할 일</h2>
      {selfItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">학생이 스스로 등록한 할 일이 없어요.</p>}
      {selfItems.map((item) => (
        <PlannerItemRow key={item.id} item={item} />
      ))}
      {confirmDialog}
    </div>
  );
}
