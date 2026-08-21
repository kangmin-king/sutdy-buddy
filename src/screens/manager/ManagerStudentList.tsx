import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { TopAppBar, Card, Button, TextField, Icon } from '../../primitives';
import { todayKey, getPlannerProgress } from '../../lib';

export default function ManagerStudentListScreen({ onSelectStudent }: { onSelectStudent: (studentId: string) => void }) {
  const { state, actions } = useAppState();
  const [code, setCode] = React.useState('');
  const today = todayKey();

  // 학생을 고르기 전에도 오늘 숙제 현황을 한눈에 보여주려면, 목록 화면에서 담당 학생 전원의
  // 오늘 planner item을 미리 불러와야 한다. 학생 수가 적은 과외 앱 특성상 병렬 호출 비용은 낮다.
  React.useEffect(() => {
    state.managedStudents.forEach((s) => actions.loadStudentPlannerItems(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.managedStudents.map((s) => s.id).join(',')]);

  return (
    <div className="px-5 pt-4 pb-10">
      <TopAppBar />
      <h1 className="text-xl font-bold mt-2 mb-4">내 학생</h1>

      <Card className="mb-4 space-y-2">
        <TextField label="학생 초대코드" value={code} onChange={setCode} placeholder="예: A1B2C3D4" />
        <Button
          className="w-full"
          onClick={() => {
            actions.linkByInviteCode(code);
            setCode('');
          }}
        >
          학생 연결하기
        </Button>
      </Card>

      <div className="space-y-2">
        {state.managedStudents.length === 0 && (
          <p className="text-sm text-on-surface-variant text-center py-10">아직 연결된 학생이 없어요.</p>
        )}
        {state.managedStudents.map((s, index) => {
          const todayItems = state.studentPlannerItems[s.id]?.[today] ?? [];
          const { completed, total } = getPlannerProgress(todayItems);
          const summary = total === 0 ? '오늘 등록된 숙제 없음' : `오늘 숙제 ${completed}/${total} 완료`;
          const summaryColor = total === 0 ? 'text-on-surface-variant' : completed === total ? 'text-secondary' : 'text-error';
          return (
            <button key={s.id} onClick={() => onSelectStudent(s.id)} className="w-full text-left">
              <Card className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{state.studentLabels[s.id] ?? `학생 ${index + 1}`}</p>
                  <p className={`text-xs mt-0.5 ${summaryColor}`}>{summary}</p>
                </div>
                <Icon name="chevron_right" className="!text-[20px] text-on-surface-variant shrink-0" />
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
