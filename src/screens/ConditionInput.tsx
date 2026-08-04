import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey } from '../lib';
import { MOODS } from '../constants';
import { BackBar, Card, SliderField, TextArea, Button, Collapsible } from '../primitives';
import type { MoodId } from '../types';

export default function ConditionInputScreen({ onBack }: { onBack: () => void }) {
  const { state, actions } = useAppState();
  const date = todayKey();
  const existing = state.conditions[date];

  const [mood, setMood] = React.useState<MoodId | null>(existing?.mood ?? null);
  const [sleepHours, setSleepHours] = React.useState(existing?.sleepHours ?? 7);
  const [focus, setFocus] = React.useState(existing?.focus ?? 3);
  const [notes, setNotes] = React.useState(existing?.notes ?? '');

  const handleSubmit = () => {
    if (!mood) return;
    const fatigue = MOODS.find((m) => m.id === mood)!.fatigueValue;
    actions.saveCondition(date, { date, sleepHours, fatigue, focus, mood, notes });
    onBack();
  };

  return (
    <div className="pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <BackBar title="컨디션 입력" onBack={onBack} />
      <div className="px-5 pt-2 space-y-5">
        <div>
          <h1 className="text-xl font-bold mb-1">오늘 컨디션 어때요?</h1>
          <p className="text-sm text-on-surface-variant">하나만 골라주세요</p>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {MOODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMood(m.id)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition ${mood === m.id ? 'border-primary bg-primary-container/20' : 'border-transparent bg-surface-container'}`}
            >
              <span className="text-2xl">{m.emoji}</span>
              <span className="text-[11px] font-medium text-on-surface-variant">{m.label}</span>
            </button>
          ))}
        </div>

        <Button className="w-full" onClick={handleSubmit} disabled={!mood}>
          완료
        </Button>

        <Collapsible label="더 자세히 적을래요">
          <Card>
            <SliderField
              label="수면 시간"
              value={sleepHours}
              min={0}
              max={12}
              step={0.5}
              onChange={setSleepHours}
              valueLabel={`${sleepHours}시간`}
              minLabel="0시간"
              maxLabel="12시간+"
            />
          </Card>
          <Card>
            <SliderField
              label="집중 잘 될 것 같은 정도"
              value={focus}
              min={1}
              max={5}
              step={1}
              onChange={setFocus}
              valueLabel={String(focus)}
              minLabel="낮음"
              maxLabel="높음"
            />
          </Card>
          <TextArea label="특이사항이 있나요?" value={notes} onChange={setNotes} placeholder="자유롭게 적어주세요." />
          <p className="text-xs text-on-surface-variant text-center">안 펼쳐도 그냥 저장돼요 — AI 조언 정확도만 조금 낮아질 뿐이에요.</p>
        </Collapsible>
      </div>
    </div>
  );
}
