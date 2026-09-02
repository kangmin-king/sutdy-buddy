import React from 'react';
import { BackBar, Card, Button, ChipGroup, TextField } from '../../primitives';
import { track } from '../../lib/analytics';

// 실제 수능 과목별 시험 시간(분). "직접입력"은 사용자가 분 단위로 직접 정한다.
const PRESETS: { id: string; label: string; minutes: number | null }[] = [
  { id: 'korean', label: '국어 (80분)', minutes: 80 },
  { id: 'math', label: '수학 (100분)', minutes: 100 },
  { id: 'english', label: '영어 (70분)', minutes: 70 },
  { id: 'history', label: '한국사 (30분)', minutes: 30 },
  { id: 'inquiry', label: '탐구 1과목 (30분)', minutes: 30 },
  { id: 'foreign', label: '제2외국어/한문 (40분)', minutes: 40 },
  { id: 'custom', label: '직접입력', minutes: null },
];

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function MockExamTimerScreen({ onClose }: { onClose: () => void }) {
  const [presetId, setPresetId] = React.useState('korean');
  const [customMinutes, setCustomMinutes] = React.useState('60');
  const [phase, setPhase] = React.useState<'setup' | 'running' | 'done'>('setup');
  const [running, setRunning] = React.useState(false);
  // running 중엔 endAt(카운트다운이 0이 되는 목표 시각) 기준으로 매번 다시 계산해서 정확도를
  // 지킨다. 일시정지하면 그 순간의 남은 시간을 remainingMsPaused에 스냅샷으로 남기고 endAt은
  // 비운다 — 학습 타이머에서 겪었던 "일시정지 시 값이 튀는" 문제를 처음부터 피하기 위함이다.
  const [endAt, setEndAt] = React.useState<number | null>(null);
  const [remainingMsPaused, setRemainingMsPaused] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(Date.now());

  const preset = PRESETS.find((p) => p.id === presetId)!;
  const totalMinutes = preset.minutes ?? Math.max(1, Number(customMinutes) || 0);
  const totalMs = totalMinutes * 60_000;

  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const remainingMs = running && endAt != null ? Math.max(0, endAt - now) : (remainingMsPaused ?? totalMs);
  const timeUp = running && remainingMs <= 0;

  React.useEffect(() => {
    if (timeUp) {
      setRunning(false);
      setEndAt(null);
      setRemainingMsPaused(0);
      setPhase('done');
      track('Ended Mock Exam Timer', {
        preset_id: presetId,
        planned_minutes: totalMinutes,
        elapsed_seconds: Math.round(totalMs / 1000),
        ended_reason: 'time_up',
      });
      if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    }
  }, [timeUp]);

  const handleStart = () => {
    setEndAt(Date.now() + totalMs);
    setRemainingMsPaused(null);
    setRunning(true);
    setPhase('running');
    // preset_id는 수능 시험지 단위(한국사·탐구·제2외국어 포함)라서 플래너의 subject_id와
    // 값 집합이 다르다. 같은 이름을 쓰면 두 열거형이 한 속성에 섞여서 못 쓰게 된다.
    track('Started Mock Exam Timer', { preset_id: presetId, planned_minutes: totalMinutes });
  };

  const handlePauseResume = () => {
    if (running) {
      setRemainingMsPaused(Math.max(0, (endAt ?? Date.now()) - Date.now()));
      setEndAt(null);
      setRunning(false);
    } else {
      setEndAt(Date.now() + (remainingMsPaused ?? totalMs));
      setRemainingMsPaused(null);
      setRunning(true);
    }
  };

  const handleFinish = () => {
    // remainingMsPaused를 갱신하지 않고 끝내면, done 화면의 elapsedMs 계산이
    // remainingMsPaused를 못 찾아 totalMs로 돌아가 "사용한 시간 00:00"으로 보이는 버그가 있었다.
    // 종료 시점의 실제 남은 시간을 스냅샷으로 남겨야 한다.
    const remaining = running && endAt != null ? Math.max(0, endAt - Date.now()) : (remainingMsPaused ?? totalMs);
    setRemainingMsPaused(remaining);
    setRunning(false);
    setEndAt(null);
    setPhase('done');
    track('Ended Mock Exam Timer', {
      preset_id: presetId,
      planned_minutes: totalMinutes,
      elapsed_seconds: Math.round((totalMs - remaining) / 1000),
      ended_reason: 'manual',
    });
  };

  const handleReset = () => {
    setRunning(false);
    setEndAt(null);
    setRemainingMsPaused(null);
    setPhase('setup');
  };

  const elapsedMs = totalMs - remainingMs;

  return (
    <div className="px-5 pt-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] min-h-screen flex flex-col">
      <BackBar title="모의고사 타이머" onBack={onClose} />

      {phase === 'setup' && (
        <div className="pt-6 space-y-5">
          <div>
            <p className="text-sm font-semibold text-on-surface-variant mb-2">과목 선택</p>
            <ChipGroup options={PRESETS} value={presetId} onChange={setPresetId} />
          </div>
          {preset.minutes == null && (
            <TextField label="시험 시간 (분)" type="number" value={customMinutes} onChange={setCustomMinutes} placeholder="예: 60" />
          )}
          <Card className="text-center">
            <p className="text-xs text-on-surface-variant mb-1">설정된 시간</p>
            <p className="text-3xl font-mono font-extrabold text-primary">{formatTime(totalMs)}</p>
          </Card>
          <Button className="w-full" onClick={handleStart} icon="play_arrow">
            시작
          </Button>
        </div>
      )}

      {phase === 'running' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <p className="text-sm font-semibold text-on-surface-variant">{preset.minutes ? preset.label : `직접입력 (${totalMinutes}분)`}</p>
          <p className={`text-7xl font-mono font-extrabold tabular-nums ${remainingMs <= 60_000 ? 'text-error' : 'text-primary'}`}>
            {formatTime(remainingMs)}
          </p>
          <div className="flex gap-3 w-full max-w-xs">
            <Button variant="outline" className="flex-1" onClick={handlePauseResume} icon={running ? 'pause' : 'play_arrow'}>
              {running ? '일시정지' : '재개'}
            </Button>
            <Button variant="error" className="flex-1" onClick={handleFinish} icon="stop">
              종료
            </Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
          <p className="text-5xl">{timeUp ? '⏰' : '🙌'}</p>
          <p className="text-lg font-bold text-on-surface">{timeUp ? '시험 시간이 끝났어요' : '수고하셨어요!'}</p>
          <Card className="text-center">
            <p className="text-xs text-on-surface-variant mb-1">사용한 시간</p>
            <p className="text-2xl font-mono font-extrabold text-primary">{formatTime(elapsedMs)}</p>
            <p className="text-xs text-on-surface-variant mt-1">/ {formatTime(totalMs)}</p>
          </Card>
          <div className="flex gap-3 w-full max-w-xs">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              다시 하기
            </Button>
            <Button className="flex-1" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
