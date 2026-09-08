import React from 'react';
import { Icon, Button, TextField, ChipGroup } from '../../primitives';
import { getSubject, SUBJECTS } from '../../constants';
import { groupItemsByManager } from './studentHomeModel';
import type { PlannerItem, SubjectId } from '../../types';

export interface TodayListProps {
  /** 아직 안 끝난 항목(진행 중인 "지금 할 공부"는 위 히어로 카드가 맡으므로 제외돼서 들어온다). */
  pending: PlannerItem[];
  completed: PlannerItem[];
  /** 선생님별 묶어보기에 필요한 것들 — 선생님이 둘 이상일 때만 토글이 뜬다. */
  managerIdOf: (item: PlannerItem) => string | null;
  linkedManagerIds: string[];
  managerLabelOf: (managerId: string) => string;
  elapsedSecondsByItemId: Record<string, number>;
  isRunning: (itemId: string) => boolean;
  canStart: (itemId: string) => boolean;
  startPending: Record<string, boolean>;
  onStart: (itemId: string) => void;
  onPause: (itemId: string) => void;
  onToggleComplete: (item: PlannerItem) => void;
  /** 직접 추가한 계획만 지울 수 있다 — 선생님이 낸 숙제는 학생이 없앨 수 없다(예전 플래너와 동일). */
  onDelete: (item: PlannerItem) => void;
  onAdd: (draft: { subjectId: SubjectId; material: string; startTime: string; endTime: string }) => void;
  originLabel: (item: PlannerItem) => string;
  details: (item: PlannerItem) => string;
  isSelfPlan: (item: PlannerItem) => boolean;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// 예전에는 오늘 할 일이 홈("다음에 할 공부" — 숙제+내 계획, 완료 숨김), 플래너(내 계획만),
// 캘린더(날짜별, 읽기 전용), 홈의 오버레이(전체) 네 군데에 서로 다른 부분집합으로 흩어져 있었다.
// 이 컴포넌트가 그 유일한 출처다 — 숙제든 내 계획이든 한 목록에 담고 배지로만 구분한다.
export default function TodayList({
  pending,
  completed,
  managerIdOf,
  linkedManagerIds,
  managerLabelOf,
  elapsedSecondsByItemId,
  isRunning,
  canStart,
  startPending,
  onStart,
  onPause,
  onToggleComplete,
  onDelete,
  onAdd,
  originLabel,
  details,
  isSelfPlan,
}: TodayListProps) {
  const [showForm, setShowForm] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [material, setMaterial] = React.useState('');
  const [startTime, setStartTime] = React.useState('09:00');
  const [endTime, setEndTime] = React.useState('');

  const submit = () => {
    if (!material.trim()) return;
    onAdd({ subjectId, material: material.trim(), startTime, endTime });
    setMaterial('');
    setEndTime('');
    setShowForm(false);
  };

  const [showCompleted, setShowCompleted] = React.useState(false);
  const isEmpty = pending.length === 0 && completed.length === 0;

  // 선생님이 여러 명일 때만 의미가 있는 정렬 토글 — 세션 안에서만 기억하고 서버엔 저장하지 않는다.
  const [sortMode, setSortMode] = React.useState<'time' | 'manager'>('time');
  const canGroup = linkedManagerIds.length > 1;
  const pendingGroups =
    canGroup && sortMode === 'manager'
      ? groupItemsByManager(pending, managerIdOf, linkedManagerIds, managerLabelOf)
      : [{ header: null, items: pending }];

  const renderRow = (item: PlannerItem, done: boolean) => {
    const running = isRunning(item.id);
    const elapsed = elapsedSecondsByItemId[item.id] ?? 0;
    const label = getSubject(item.subjectId).label;
    return (
      <article key={item.id} className={`flex items-start gap-3 px-4 py-3.5 ${done ? 'opacity-55' : ''}`}>
        <button
          onClick={() => onToggleComplete(item)}
          aria-label={`${label} ${done ? '완료 해제' : '완료 표시'}`}
          className={`-my-2 -ml-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full transition active:scale-[0.94] ${
            done ? 'text-primary' : 'text-outline'
          }`}
        >
          <Icon name={done ? 'task_alt' : 'radio_button_unchecked'} className="!text-[21px]" filled={done} />
        </button>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={`text-sm font-bold text-on-surface ${done ? 'line-through decoration-outline' : ''}`}>{label}</h3>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                isSelfPlan(item) ? 'bg-primary/10 text-primary' : 'bg-tertiary/10 text-tertiary'
              }`}
            >
              {originLabel(item)}
            </span>
          </div>
          <p className="mt-0.5 break-words text-xs leading-relaxed text-on-surface-variant">{details(item) || '학습 내용 미입력'}</p>
          {elapsed > 0 && <p className="mt-1 font-mono text-[11px] font-bold tabular-nums text-secondary">{formatElapsed(elapsed)} 학습</p>}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!done && (
            <button
              onClick={() => (running ? onPause(item.id) : onStart(item.id))}
              disabled={Boolean(startPending[item.id]) || (!running && !canStart(item.id))}
              aria-label={`${label} ${running ? '일시정지' : '시작'}`}
              className={`inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-bold transition active:scale-[0.96] disabled:opacity-50 ${
                running ? 'bg-surface-container text-on-surface' : 'bg-primary/10 text-primary'
              }`}
            >
              <Icon name={running ? 'pause' : 'play_arrow'} className="!text-[17px]" />
              {running ? '멈춤' : '시작'}
            </button>
          )}
          {isSelfPlan(item) && (
            <button
              onClick={() => onDelete(item)}
              aria-label={`${label} 계획 삭제`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-on-surface-variant transition hover:bg-surface-container active:scale-[0.94]"
            >
              <Icon name="close" className="!text-[18px]" />
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className="mt-6" aria-labelledby="today-list-title">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 id="today-list-title" className="text-sm font-bold text-on-surface">오늘의 할 일</h2>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">
            {completed.length}개 완료 · {pending.length}개 남음
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canGroup && (
            <div className="flex rounded-full bg-surface-container p-0.5">
              {(['time', 'manager'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  aria-pressed={sortMode === mode}
                  className={`min-h-11 rounded-full px-3 text-[10px] font-semibold transition ${
                    sortMode === mode ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                  }`}
                >
                  {mode === 'time' ? '시간순' : '선생님별'}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowForm((open) => !open)}
            aria-expanded={showForm}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs font-bold text-primary transition active:scale-[0.96]"
          >
            <Icon name={showForm ? 'close' : 'add_circle'} className="!text-[18px]" />
            {showForm ? '닫기' : '계획 추가'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-2 space-y-3 rounded-2xl bg-surface-container-low p-4">
          <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
          <TextField label="뭐 할지" value={material} onChange={setMaterial} placeholder="예: 수학 익힘책 2단원" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="시작" type="time" value={startTime} onChange={setStartTime} />
            <TextField label="종료" type="time" value={endTime} onChange={setEndTime} />
          </div>
          <Button className="w-full" onClick={submit} disabled={!material.trim()}>
            오늘 계획에 추가
          </Button>
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-2xl bg-surface-container-low px-5 py-8 text-center">
          <Icon name="edit_calendar" className="!text-[30px] text-primary" filled />
          <p className="mt-2 text-sm font-bold text-on-surface">오늘 할 일이 아직 없어요</p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            위 "계획 추가"로 직접 넣거나, 선생님이 숙제를 보내면 여기에 쌓여요.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-card divide-y divide-outline-variant/40">
          {pendingGroups.map((group) => (
            <div key={group.header ?? 'all'} className="divide-y divide-outline-variant/40">
              {group.header && (
                <p className="bg-surface-container-low px-4 py-1.5 text-[10px] font-bold text-tertiary">{group.header}</p>
              )}
              {group.items.map((item) => renderRow(item, false))}
            </div>
          ))}
          {completed.length > 0 &&
            (showCompleted ? (
              completed.map((item) => renderRow(item, true))
            ) : (
              <button
                onClick={() => setShowCompleted(true)}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container"
              >
                완료 {completed.length}개 보기
                <Icon name="expand_more" className="!text-[16px]" />
              </button>
            ))}
          {showCompleted && completed.length > 0 && (
            <button
              onClick={() => setShowCompleted(false)}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 text-xs font-semibold text-on-surface-variant transition hover:bg-surface-container"
            >
              완료 접기
              <Icon name="expand_less" className="!text-[16px]" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
