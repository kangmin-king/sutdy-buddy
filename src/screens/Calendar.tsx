import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, weekStrip, formatMinutes, uid } from '../lib';
import { getFreeTimeAndSuggestion } from '../ai';
import { DIFFICULTY_LEVELS } from '../constants';
import { TopAppBar, Card, SectionTitle, ChipGroup, TextField, Button, Icon } from '../primitives';
import type { TabId } from '../primitives';
import type { ScheduleBlock } from '../types';

const BLOCK_TYPES = [
  { id: 'school', label: '학교' },
  { id: 'academy', label: '학원' },
  { id: 'meal', label: '식사' },
  { id: 'rest', label: '휴식' },
  { id: 'commute', label: '이동' },
  { id: 'other', label: '기타' },
];

export default function CalendarScreen({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { state, actions } = useAppState();
  const [selectedDate, setSelectedDate] = React.useState(todayKey());
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ type: 'school', label: '', startTime: '08:00', endTime: '16:00' });

  const blocks = state.scheduleBlocks[selectedDate] ?? [];
  const condition = state.conditions[selectedDate] ?? null;
  const { totalFreeMinutes, bestGap, recommendedDifficulty, suggestionText } = getFreeTimeAndSuggestion(blocks, condition);

  const days = weekStrip(selectedDate);

  const addBlock = () => {
    if (!form.label.trim()) return;
    const block: ScheduleBlock = { id: uid(), date: selectedDate, ...form };
    actions.upsertScheduleBlock(selectedDate, block);
    setForm({ type: 'school', label: '', startTime: '08:00', endTime: '16:00' });
    setShowForm(false);
  };

  const [y, m] = selectedDate.split('-');

  return (
    <div className="px-5 pt-4 pb-28">
      <TopAppBar />

      <div className="flex items-center justify-between mt-2 mb-3">
        <p className="text-base font-bold">
          {y}년 {Number(m)}월
        </p>
        <button onClick={() => setSelectedDate(todayKey())} className="text-xs font-semibold bg-surface-container rounded-full px-3 py-1.5">
          오늘
        </button>
      </div>

      <div className="flex justify-between mb-5">
        {days.map((d) => (
          <button
            key={d.key}
            onClick={() => setSelectedDate(d.key)}
            className={`flex flex-col items-center gap-1 w-9 py-2 rounded-xl ${d.key === selectedDate ? 'bg-primary text-on-primary' : 'text-on-surface'}`}
          >
            <span className="text-[11px]">{d.label}</span>
            <span className="text-sm font-bold">{d.date}</span>
          </button>
        ))}
      </div>

      <Card tint="secondary" className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="event_available" className="text-secondary" />
          <span className="text-sm font-bold">오늘 공부 가능 시간 요약</span>
        </div>
        <div className="grid grid-cols-3 text-center">
          <div>
            <p className="text-xs text-on-surface-variant">총 시간</p>
            <p className="text-sm font-bold">{formatMinutes(totalFreeMinutes)}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">최적 시간</p>
            <p className="text-sm font-bold">{bestGap ? `${bestGap.start}~${bestGap.end}` : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">추천 난이도</p>
            <p className="text-sm font-bold">{DIFFICULTY_LEVELS.find((d) => d.id === recommendedDifficulty)?.label}</p>
          </div>
        </div>
      </Card>

      <SectionTitle
        action={
          <button onClick={() => setShowForm((s) => !s)} className="text-primary flex items-center gap-1 text-xs font-semibold">
            <Icon name="add_circle" className="!text-[18px]" /> 일정 추가
          </button>
        }
      >
        오늘의 일과
      </SectionTitle>

      {showForm && (
        <Card className="mb-4 space-y-3">
          <ChipGroup options={BLOCK_TYPES} value={form.type} onChange={(type) => setForm((f) => ({ ...f, type }))} />
          <TextField label="일정 이름" value={form.label} onChange={(label) => setForm((f) => ({ ...f, label }))} placeholder="예: 정규 수업" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="시작" type="time" value={form.startTime} onChange={(startTime) => setForm((f) => ({ ...f, startTime }))} />
            <TextField label="종료" type="time" value={form.endTime} onChange={(endTime) => setForm((f) => ({ ...f, endTime }))} />
          </div>
          <Button className="w-full" onClick={addBlock}>
            추가하기
          </Button>
        </Card>
      )}

      <div className="space-y-2 mb-5">
        {blocks.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">등록된 일정이 없어요. 일정을 추가해보세요.</p>}
        {blocks.map((b) => {
          const bt = BLOCK_TYPES.find((t) => t.id === b.type) ?? BLOCK_TYPES[0];
          return (
            <div key={b.id} className="flex items-center justify-between rounded-xl bg-surface-container-high px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{b.label}</p>
                <p className="text-xs text-on-surface-variant">
                  {bt.label} · {b.startTime} - {b.endTime}
                </p>
              </div>
              <button onClick={() => actions.deleteScheduleBlock(selectedDate, b.id)} className="text-on-surface-variant">
                <Icon name="close" className="!text-[18px]" />
              </button>
            </div>
          );
        })}
      </div>

      <Card tint="tertiary">
        <div className="flex items-center gap-2 mb-2">
          <Icon name="lightbulb" className="text-tertiary" />
          <span className="text-sm font-bold">AI 추천 분석</span>
        </div>
        <p className="text-sm text-on-surface leading-relaxed mb-3">{suggestionText}</p>
        <Button variant="ghost" onClick={() => onNavigate('planner')}>
          추천 플랜 만들기
        </Button>
      </Card>
    </div>
  );
}
