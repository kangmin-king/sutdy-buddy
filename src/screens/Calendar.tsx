import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, monthGrid, addMonthsToKey, uid } from '../lib';
import { getScheduleTip } from '../ai';
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

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export default function CalendarScreen({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [viewMonthKey, setViewMonthKey] = React.useState(today);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ type: 'school', label: '', startTime: '08:00', endTime: '16:00' });

  const blocks = state.scheduleBlocks[selectedDate] ?? [];
  const condition = state.conditions[selectedDate] ?? null;
  const suggestionText = getScheduleTip(blocks, condition);

  const grid = monthGrid(viewMonthKey);

  const addBlock = () => {
    if (!form.label.trim()) return;
    const block: ScheduleBlock = { id: uid(), date: selectedDate, ...form };
    actions.upsertScheduleBlock(selectedDate, block);
    setForm({ type: 'school', label: '', startTime: '08:00', endTime: '16:00' });
    setShowForm(false);
  };

  const goToToday = () => {
    setSelectedDate(today);
    setViewMonthKey(today);
  };

  const [viewY, viewM] = viewMonthKey.split('-');
  const [selY, selM, selD] = selectedDate.split('-');

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />

      <div className="flex items-center justify-between mt-2 mb-3">
        <button onClick={() => setViewMonthKey(addMonthsToKey(viewMonthKey, -1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="chevron_left" />
        </button>
        <p className="text-base font-bold">
          {viewY}년 {Number(viewM)}월
        </p>
        <div className="flex items-center gap-2">
          <button onClick={goToToday} className="text-xs font-semibold bg-surface-container rounded-full px-3 py-1.5">
            오늘
          </button>
          <button onClick={() => setViewMonthKey(addMonthsToKey(viewMonthKey, 1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
            <Icon name="chevron_right" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[11px] text-on-surface-variant py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 mb-5">
        {grid.map((d) => {
          const isSelected = d.key === selectedDate;
          const isToday = d.key === today;
          const hasBlocks = (state.scheduleBlocks[d.key] ?? []).length > 0;
          return (
            <button key={d.key} onClick={() => setSelectedDate(d.key)} className="flex flex-col items-center py-1.5">
              <span
                className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                  isSelected
                    ? 'bg-primary text-on-primary font-bold'
                    : isToday
                      ? 'border border-primary text-primary font-semibold'
                      : d.inCurrentMonth
                        ? 'text-on-surface'
                        : 'text-outline-variant'
                }`}
              >
                {d.date}
              </span>
              <span className={`w-1 h-1 rounded-full mt-0.5 ${hasBlocks ? 'bg-secondary' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-primary mb-3">
        {selY}년 {Number(selM)}월 {Number(selD)}일{selectedDate === today ? ' (오늘)' : ''} 선택됨
      </p>

      <SectionTitle
        action={
          <button onClick={() => setShowForm((s) => !s)} className="text-primary flex items-center gap-1 text-xs font-semibold">
            <Icon name="add_circle" className="!text-[18px]" /> 일정 추가
          </button>
        }
      >
        선택한 날짜의 일과
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
