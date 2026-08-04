import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, timeToMinutes, getPlannerProgress } from '../lib';
import { getSubject, getStudyType } from '../constants';
import { Icon, TopAppBar, Card, ProgressBar, AiTipCard, Button, BottomSheet, TextField, Chip } from '../primitives';
import type { PlannerItem, PlannerItemStatus } from '../types';

const REASON_CHIPS = ['집중이 안 됐어요', '생각보다 어려웠어요', '다른 일이 생겼어요', '시간이 부족했어요', '다른 일정과 겹쳤어요', '너무 피곤했어요'];

function StatusIcon({ status }: { status: PlannerItemStatus }) {
  if (status === 'completed') return <Icon name="check_circle" filled className="!text-[26px] text-secondary" />;
  if (status === 'partial') return <Icon name="radio_button_checked" className="!text-[26px] text-tertiary" />;
  return <Icon name="circle" className="!text-[26px] text-outline-variant" />;
}

export default function ExecutionCheckScreen({
  onOpenStudyLog,
  onOpenAiRecommendation,
}: {
  onOpenStudyLog: (item: PlannerItem) => void;
  onOpenAiRecommendation: () => void;
}) {
  const { state, actions } = useAppState();
  const date = todayKey();
  const items = (state.plannerItems[date] ?? []).slice().sort((a, b) => a.order - b.order);
  const progress = getPlannerProgress(items);

  const [sheetItem, setSheetItem] = React.useState<PlannerItem | null>(null);
  const [reason, setReason] = React.useState('');
  const [actualMinutes, setActualMinutes] = React.useState('');

  const openSheet = (item: PlannerItem) => {
    setSheetItem(item);
    setActualMinutes(item.actualMinutes != null ? String(item.actualMinutes) : '');
    setReason(item.partialReason ?? item.incompleteReason ?? '');
  };

  const setStatus = (status: PlannerItemStatus) => {
    if (!sheetItem) return;
    const patch: Partial<PlannerItem> = { status };
    if (status === 'completed') {
      const plannedMinutes = sheetItem.endTime ? Math.max(0, timeToMinutes(sheetItem.endTime) - timeToMinutes(sheetItem.startTime)) : 0;
      patch.actualMinutes = actualMinutes === '' ? plannedMinutes : Number(actualMinutes);
    } else if (status === 'partial') {
      patch.partialReason = reason;
      patch.actualMinutes = actualMinutes === '' ? null : Number(actualMinutes);
    } else if (status === 'carried_over') {
      patch.incompleteReason = reason;
    }
    actions.updatePlannerItem(date, sheetItem.id, patch);
    setSheetItem(null);
  };

  const understandingOptions: { id: 'low' | 'medium' | 'high'; label: string }[] = [
    { id: 'low', label: '낮음' },
    { id: 'medium', label: '보통' },
    { id: 'high', label: '높음' },
  ];

  return (
    <div className="px-5 pt-4 pb-[calc(10rem+env(safe-area-inset-bottom))]">
      <TopAppBar />

      <p className="text-xs font-semibold text-on-surface-variant mt-2">오늘의 달성률</p>
      <h1 className="text-2xl font-extrabold mb-1">{progress.percent}% 완료</h1>
      <p className="text-sm text-on-surface-variant mb-2">
        {progress.completed}/{progress.total} 작업 완료
      </p>
      <ProgressBar percent={progress.percent} className="mb-5" />

      <h2 className="text-base font-bold mb-3">학습 체크리스트</h2>
      <div className="space-y-3 mb-5">
        {items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">오늘 플래너에 항목이 없어요.</p>}
        {items.map((it) => (
          <Card key={it.id}>
            <div className="flex items-start gap-3">
              <button onClick={() => openSheet(it)} className="mt-0.5">
                <StatusIcon status={it.status} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-bold ${it.status === 'completed' ? 'line-through opacity-50' : ''}`}>
                    {getSubject(it.subjectId).label}: {it.material || getStudyType(it.studyType).label}
                  </p>
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-surface-container text-on-surface-variant shrink-0">
                    {it.status === 'completed' ? '완료' : it.status === 'partial' ? '일부 완료' : it.status === 'carried_over' ? '내일로 조정' : '예정'}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {it.startTime}
                  {it.endTime ? ` - ${it.endTime}` : ''}
                </p>
                {(it.partialReason || it.incompleteReason) && (
                  <span className="inline-block mt-1.5 text-xs bg-surface-container-high rounded-full px-2 py-1">{it.partialReason || it.incompleteReason}</span>
                )}
                {it.status === 'completed' && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/40">
                    <span className="text-xs text-on-surface-variant">실제 {it.actualMinutes ?? '-'}분</span>
                    <div className="flex gap-1">
                      {understandingOptions.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => actions.updatePlannerItem(date, it.id, { understanding: u.id })}
                          className={`text-[11px] rounded-full px-2 py-0.5 ${it.understanding === u.id ? 'bg-primary text-on-primary' : 'bg-surface-container'}`}
                        >
                          {u.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {it.status === 'completed' && (
                  <button onClick={() => onOpenStudyLog(it)} className="mt-2 text-xs font-semibold text-primary underline">
                    학습 기록 작성하기
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AiTipCard
        icon="analytics"
        text={`오늘은 ${progress.total}개 중 ${progress.completed}개를 완료했어요. ${progress.percent < 100 ? '무리하지 말고 남은 항목은 내일로 조정해도 괜찮아요.' : '정말 훌륭해요!'}`}
      />

      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-full max-w-[480px] px-5 pb-3 pt-2 bg-gradient-to-t from-surface via-surface/95 z-20">
        <Button className="w-full" onClick={onOpenAiRecommendation} icon="bedtime">
          오늘 하루 마무리!!
        </Button>
      </div>

      <BottomSheet open={!!sheetItem} onClose={() => setSheetItem(null)} title={sheetItem ? `${getSubject(sheetItem.subjectId).label} 상태 변경` : ''}>
        {sheetItem && (
          <div className="space-y-4">
            <TextField label="실제 학습 시간(분)" type="number" value={actualMinutes} onChange={setActualMinutes} placeholder="예: 45" />
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => setStatus('completed')}>
                완료
              </Button>
              <Button variant="ghost" onClick={() => setStatus('partial')}>
                일부 완료
              </Button>
              <Button variant="outline" onClick={() => setStatus('carried_over')}>
                내일로 조정
              </Button>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant mb-1.5">사유 (선택)</p>
              <div className="flex flex-wrap gap-2">
                {REASON_CHIPS.map((r) => (
                  <Chip key={r} label={r} active={reason === r} onClick={() => setReason(r === reason ? '' : r)} />
                ))}
              </div>
            </div>
            {sheetItem.status === 'carried_over' && (
              <Button variant="error" className="w-full" onClick={() => actions.deletePlannerItem(date, sheetItem.id)}>
                삭제
              </Button>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
