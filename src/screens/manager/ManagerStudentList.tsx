import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { TopAppBar, Card, Button, TextField, Icon } from '../../primitives';
import { todayKey, getPlannerProgress } from '../../lib';
import { DEFAULT_HOMEWORK_REMIND_AT } from '../../constants';
import { allowedAppSummary } from '../shared/allowedAppUsageModel';

export default function ManagerStudentListScreen({
  onSelectStudent,
  onOpenReminderSetting,
}: {
  onSelectStudent: (studentId: string) => void;
  onOpenReminderSetting: (studentId: string) => void;
}) {
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
          const usageSummary = allowedAppSummary(state.allowedAppIntervals[s.id] ?? [], Date.now());
          // 설정 행이 없는 학생은 기본값으로 동작한다(0023 마이그레이션) — 그 사실도 그대로 보여준다.
          const reminder = state.homeworkReminderSettings[s.id];
          const remindAt = reminder?.remindAt ?? DEFAULT_HOMEWORK_REMIND_AT;
          const reminderEnabled = reminder?.enabled ?? true;
          return (
            <Card key={s.id} className="flex items-center justify-between gap-2">
              {/* 카드 전체를 감싸는 버튼이었지만, 알림 칩이 별도 탭 대상이 되면서 버튼 중첩을
                  피하려고 왼쪽 영역만 버튼으로 남겼다. */}
              <button onClick={() => onSelectStudent(s.id)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-bold">{state.studentLabels[s.id] ?? `학생 ${index + 1}`}</p>
                <p className={`text-xs mt-0.5 ${summaryColor}`}>{summary}</p>
                {usageSummary && <p className="text-xs mt-0.5 text-on-surface-variant">{usageSummary}</p>}
              </button>
              <div className="flex items-center gap-0.5 shrink-0">
                {/* 알림 시각이 캘린더 탭 안쪽에만 있어서 "설정할 수 있는지"조차 보이지 않던 문제.
                    여기서 현재 값을 보여주고, 누르면 그 학생의 설정 시트로 바로 들어간다. */}
                <button
                  onClick={() => onOpenReminderSetting(s.id)}
                  aria-label={`${state.studentLabels[s.id] ?? `학생 ${index + 1}`} 미시작 알림 설정`}
                  className={`inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition active:scale-[0.96] ${
                    reminderEnabled ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  <Icon name={reminderEnabled ? 'notifications' : 'notifications_off'} className="!text-[15px]" />
                  {reminderEnabled ? remindAt : '알림 꺼짐'}
                </button>
                <Icon name="chevron_right" className="!text-[20px] text-on-surface-variant" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
