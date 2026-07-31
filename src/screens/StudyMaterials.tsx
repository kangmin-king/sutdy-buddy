import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, computeMaterialPace } from '../lib';
import { SUBJECTS, getSubject } from '../constants';
import { BackBar, Card, ChipGroup, TextField, Button, ProgressBar } from '../primitives';
import type { SubjectId } from '../types';

export default function StudyMaterialsScreen({ onBack }: { onBack: () => void }) {
  const { state, actions } = useAppState();
  const today = todayKey();

  const [showForm, setShowForm] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [materialName, setMaterialName] = React.useState('');
  const [totalScope, setTotalScope] = React.useState('');
  const [currentProgress, setCurrentProgress] = React.useState('0');
  const [targetPasses, setTargetPasses] = React.useState(1);
  const [targetDate, setTargetDate] = React.useState('');
  const [sessionIntervalDays, setSessionIntervalDays] = React.useState('3');

  const canSubmit = materialName.trim() && Number(totalScope) > 0 && targetDate && Number(sessionIntervalDays) > 0;

  const handleAdd = () => {
    if (!canSubmit) return;
    actions.addStudyMaterial({
      subjectId,
      materialName: materialName.trim(),
      totalScope: Number(totalScope),
      currentProgress: Number(currentProgress) || 0,
      targetPasses,
      targetDate,
      sessionIntervalDays: Number(sessionIntervalDays),
    });
    setMaterialName('');
    setTotalScope('');
    setCurrentProgress('0');
    setTargetPasses(1);
    setTargetDate('');
    setSessionIntervalDays('3');
    setShowForm(false);
  };

  const previewPace =
    canSubmit &&
    computeMaterialPace(
      {
        id: 'preview',
        subjectId,
        materialName,
        totalScope: Number(totalScope),
        currentProgress: Number(currentProgress) || 0,
        targetPasses,
        targetDate,
        sessionIntervalDays: Number(sessionIntervalDays),
        createdAt: '',
      },
      today
    );

  return (
    <div className="pb-10">
      <BackBar title="학습 자료 목표" onBack={onBack} />
      <div className="px-5 pt-2 space-y-4">
        {!showForm && (
          <Button className="w-full" onClick={() => setShowForm(true)} icon="add_circle">
            + 학습 자료 추가
          </Button>
        )}

        {showForm && (
          <Card className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-on-surface-variant mb-2">과목</p>
              <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
            </div>
            <TextField label="자료명" value={materialName} onChange={setMaterialName} placeholder="예: 개념원리" />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="전체 분량(p)" value={totalScope} onChange={setTotalScope} type="number" placeholder="220" />
              <TextField label="지금까지" value={currentProgress} onChange={setCurrentProgress} type="number" placeholder="0" />
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface-variant mb-2">목표 회독 수</p>
              <ChipGroup
                options={[1, 2, 3].map((n) => ({ id: String(n), label: `${n}회독` }))}
                value={String(targetPasses)}
                onChange={(v) => setTargetPasses(Number(v))}
              />
            </div>
            <TextField label="이 자료, 언제까지 끝낼까요?" value={targetDate} onChange={setTargetDate} type="date" />
            <TextField label="며칠에 한 번 공부할까요?" value={sessionIntervalDays} onChange={setSessionIntervalDays} type="number" placeholder="3" />

            {previewPace && (
              <div className="rounded-xl bg-primary-container/20 px-3 py-2.5 text-sm text-primary">
                📐 D-{previewPace.remainingDays}, {sessionIntervalDays}일에 1번 → 총 {previewPace.remainingSessions}번 세션 남음
                <br />
                세션당 <b>{previewPace.scopePerSession}p</b>
              </div>
            )}

            <Button className="w-full" onClick={handleAdd} disabled={!canSubmit}>
              저장
            </Button>
          </Card>
        )}

        <h2 className="text-base font-bold">내 학습 자료</h2>
        <div className="space-y-2">
          {state.studyMaterials.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">아직 등록한 학습 자료가 없어요.</p>}
          {state.studyMaterials.map((material) => {
            const pace = computeMaterialPace(material, today);
            const donePercent = Math.round((material.currentProgress / (material.totalScope * material.targetPasses)) * 100);
            return (
              <Card key={material.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] bg-primary-container/40 text-primary rounded-full px-2.5 py-0.5">{getSubject(material.subjectId).label}</span>
                  <span className={`text-[11px] font-semibold ${pace.isOverdue ? 'text-error' : 'text-on-surface-variant'}`}>
                    {pace.isOverdue ? '기한이 지났어요' : `목표일 ${material.targetDate} · D-${pace.remainingDays}`}
                  </span>
                </div>
                <p className="text-sm font-bold text-on-surface my-1">{material.materialName}</p>
                <p className="text-xs text-on-surface-variant mb-2">
                  {material.totalScope * material.targetPasses}p 중 {material.currentProgress}p · {material.sessionIntervalDays}일에 1번
                </p>
                <ProgressBar percent={donePercent} className="mb-2" />
                {!pace.isOverdue && pace.remainingScope > 0 && (
                  <p className="text-xs text-primary font-semibold">→ 다음 세션({pace.remainingSessions}번 남음): {pace.scopePerSession}p씩</p>
                )}
                <button
                  onClick={() => actions.deleteStudyMaterial(material.id)}
                  className="mt-2 text-xs text-on-surface-variant underline"
                >
                  삭제
                </button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
