import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, timeToMinutes, minutesToTime } from '../lib';
import { STUDY_TYPES, DIFFICULTY_LEVELS, REST_PATTERNS, getSubject } from '../constants';
import { BackBar, Card, ChipGroup, TextField, SelectField, ToggleSwitch, Icon, Button } from '../primitives';
import type { PlannerItem, StudyTypeId, DifficultyId, RestPatternId } from '../types';

export default function PlannerItemDetailScreen({
  item,
  allItemsToday,
  onBack,
}: {
  item: PlannerItem;
  allItemsToday: PlannerItem[];
  onBack: () => void;
}) {
  const { actions } = useAppState();
  const date = todayKey();

  const [studyType, setStudyType] = React.useState<StudyTypeId | null>(item.studyType);
  const [material, setMaterial] = React.useState(item.material);
  const [unit, setUnit] = React.useState(item.unit);
  const [pageRange, setPageRange] = React.useState(item.pageRange);
  const [endTime, setEndTime] = React.useState(item.endTime ?? '');
  const [difficulty, setDifficulty] = React.useState<DifficultyId | null>(item.difficulty);
  const [restPattern, setRestPattern] = React.useState<RestPatternId>(item.restPattern ?? 'none');
  const [mustDo, setMustDo] = React.useState(item.mustDo);
  const [startTime, setStartTime] = React.useState(item.startTime);

  const others = allItemsToday.filter((i) => i.id !== item.id);
  const conflicts = endTime
    ? others.filter((o) => o.endTime && timeToMinutes(startTime) < timeToMinutes(o.endTime!) && timeToMinutes(endTime) > timeToMinutes(o.startTime))
    : [];

  const autoAdjust = () => {
    if (conflicts.length === 0) return;
    const latestEnd = conflicts.reduce((max, c) => Math.max(max, timeToMinutes(c.endTime!)), 0);
    const durationMinutes = endTime ? timeToMinutes(endTime) - timeToMinutes(startTime) : null;
    setStartTime(minutesToTime(latestEnd));
    if (durationMinutes !== null) setEndTime(minutesToTime(latestEnd + Math.max(0, durationMinutes)));
  };

  const sorted = allItemsToday.slice().sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((i) => i.id === item.id);
  const canMoveUp = index > 0;
  const canMoveDown = index >= 0 && index < sorted.length - 1;

  const moveOrder = (direction: -1 | 1) => {
    const swapWith = sorted[index + direction];
    if (!swapWith) return;
    actions.updatePlannerItem(date, item.id, { order: swapWith.order });
    actions.updatePlannerItem(date, swapWith.id, { order: item.order });
  };

  const handleSave = () => {
    actions.updatePlannerItem(date, item.id, {
      studyType,
      material,
      unit,
      pageRange,
      startTime,
      endTime: endTime || null,
      difficulty,
      restPattern,
      mustDo,
    });
    onBack();
  };

  return (
    <div className="pb-10">
      <BackBar title={`${getSubject(item.subjectId).label} · ${startTime} 시작`} onBack={handleSave} />
      <div className="px-5 pt-2 space-y-4">
        <Card className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-on-surface-variant mb-2">학습 유형</p>
            <ChipGroup options={STUDY_TYPES} value={studyType ?? ''} onChange={(v) => setStudyType(v as StudyTypeId)} getIcon={(o) => o.icon} />
          </div>

          <TextField label="교재/자료명" value={material} onChange={setMaterial} placeholder="예: 쎈 수학 (상)" />

          <div className="grid grid-cols-2 gap-3">
            <TextField label="단원" value={unit} onChange={setUnit} placeholder="예: 2단원" />
            <TextField label="페이지" value={pageRange} onChange={setPageRange} placeholder="예: 42-50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TextField label="시작" type="time" value={startTime} onChange={setStartTime} />
            <TextField label="종료" type="time" value={endTime} onChange={setEndTime} />
          </div>

          {conflicts.length > 0 && (
            <div className="rounded-xl bg-error-container/40 px-3 py-2.5 text-sm text-on-error-container">
              <div className="flex items-center gap-2 mb-1">
                <Icon name="warning" className="!text-[18px]" />
                이 시간에는 이미 "{getSubject(conflicts[0].subjectId).label}" 학습이 있어요.
              </div>
              <button onClick={autoAdjust} className="text-primary font-semibold underline text-sm">
                자동 조정하기
              </button>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-on-surface-variant mb-2">난이도</p>
            <ChipGroup options={DIFFICULTY_LEVELS} value={difficulty ?? ''} onChange={(v) => setDifficulty(v as DifficultyId)} />
          </div>

          <SelectField label="휴식 패턴" value={restPattern} onChange={(v) => setRestPattern(v as RestPatternId)} options={REST_PATTERNS} />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-on-surface">학습 순서</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant">{index + 1}번째</span>
              <button onClick={() => moveOrder(-1)} disabled={!canMoveUp} className="disabled:opacity-30">
                <Icon name="arrow_upward" className="!text-[18px]" />
              </button>
              <button onClick={() => moveOrder(1)} disabled={!canMoveDown} className="disabled:opacity-30">
                <Icon name="arrow_downward" className="!text-[18px]" />
              </button>
            </div>
          </div>

          <ToggleSwitch checked={mustDo} onChange={setMustDo} label="필수 과제로 표시" />
        </Card>

        <p className="text-xs text-on-surface-variant text-center">전부 비워둬도 저장 가능 — 나중에 다시 들어와서 채워도 돼요.</p>

        <Button className="w-full" onClick={handleSave}>
          저장
        </Button>
      </div>
    </div>
  );
}
