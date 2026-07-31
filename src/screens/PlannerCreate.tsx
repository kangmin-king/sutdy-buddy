import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, uid, resolveQuickTimeChip } from '../lib';
import { SUBJECTS, QUICK_TIME_CHIPS, getSubject } from '../constants';
import { TopAppBar, Card, SectionTitle, ChipGroup, Button, Icon } from '../primitives';
import PlannerItemDetailScreen from './PlannerItemDetail';
import type { SubjectId } from '../types';
import type { QuickTimeChipId } from '../constants';

export default function PlannerCreateScreen() {
  const { state, actions } = useAppState();
  const date = todayKey();
  const items = (state.plannerItems[date] ?? []).slice().sort((a, b) => a.order - b.order);
  const blocks = state.scheduleBlocks[date] ?? [];

  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [chipId, setChipId] = React.useState<QuickTimeChipId>('now');

  if (selectedItemId) {
    const item = items.find((i) => i.id === selectedItemId);
    if (item) {
      return <PlannerItemDetailScreen item={item} allItemsToday={items} onBack={() => setSelectedItemId(null)} />;
    }
    setSelectedItemId(null);
  }

  const nowTime = new Date().toTimeString().slice(0, 5);

  const handleAdd = () => {
    const startTime = resolveQuickTimeChip(chipId, blocks, nowTime);
    actions.addPlannerItem(date, {
      date,
      subjectId,
      startTime,
      studyType: null,
      material: '',
      unit: '',
      pageRange: '',
      endTime: null,
      difficulty: null,
      restPattern: null,
      mustDo: false,
      status: 'planned',
      actualMinutes: null,
      understanding: null,
      partialReason: null,
      incompleteReason: null,
    });
    setShowForm(false);
  };

  return (
    <div className="px-5 pt-4 pb-28">
      <TopAppBar />
      <h1 className="text-xl font-bold mt-2 mb-1">오늘의 학습</h1>
      <p className="text-sm text-on-surface-variant mb-4">과목 + 시작 시간만 입력하면 끝. 나머지는 눌러서 원할 때 채워요.</p>

      {!showForm && (
        <Button className="w-full mb-4" onClick={() => setShowForm(true)} icon="add_task">
          + 과목 추가
        </Button>
      )}

      {showForm && (
        <Card className="mb-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-on-surface-variant mb-2">과목 선택</p>
            <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
          </div>
          <div>
            <p className="text-sm font-semibold text-on-surface-variant mb-2">언제 시작할까요?</p>
            <ChipGroup options={[...QUICK_TIME_CHIPS]} value={chipId} onChange={setChipId} />
          </div>
          <Button className="w-full" onClick={handleAdd}>
            추가하기
          </Button>
        </Card>
      )}

      <SectionTitle>오늘의 학습 목록 ({items.length})</SectionTitle>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">아직 추가된 학습이 없어요.</p>}
        {items.map((it) => (
          <button key={it.id} onClick={() => setSelectedItemId(it.id)} className="w-full text-left">
            <Card className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                <div>
                  <p className="text-sm font-bold text-on-surface">
                    {getSubject(it.subjectId).label} {it.mustDo && <span className="text-tertiary">★</span>}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {it.startTime} 시작{it.material ? ` · ${it.material}` : ''}
                  </p>
                </div>
              </div>
              <Icon name="chevron_right" className="text-outline-variant" />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
