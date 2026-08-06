import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import PlannerItemRow from './PlannerItemRow';

export default function ManagerHomeScreen({ studentId }: { studentId: string }) {
  const { state, actions } = useAppState();
  const today = todayKey();

  React.useEffect(() => {
    actions.loadStudentPlannerItems(studentId);
    // studentId 바뀔 때만 다시 불러온다 — actions는 매 렌더 재생성되므로 deps에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const items = (state.studentPlannerItems[studentId]?.[today] ?? []).slice().sort((a, b) => a.order - b.order);
  const homeworkItems = items.filter((it) => it.source === 'homework');
  const selfItems = items.filter((it) => it.source === 'self');

  return (
    <div className="px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <h2 className="text-base font-bold mt-2 mb-2">오늘 숙제</h2>
      {homeworkItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">오늘 등록된 숙제가 없어요.</p>}
      {homeworkItems.map((item) => (
        <PlannerItemRow
          key={item.id}
          item={item}
          onSaveAmount={(value) => actions.updateHomeworkAmountForDate(studentId, item.id, today, item.examSubjectRangeId, value)}
        />
      ))}

      <h2 className="text-base font-bold mt-6 mb-2">오늘 할 일</h2>
      {selfItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">학생이 스스로 등록한 할 일이 없어요.</p>}
      {selfItems.map((item) => (
        <PlannerItemRow key={item.id} item={item} />
      ))}
    </div>
  );
}
