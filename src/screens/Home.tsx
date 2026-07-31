import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, formatDateKorean, formatMinutes, getPlannerProgress, computeMaterialPace } from '../lib';
import { getHomeTip, getFreeTimeAndSuggestion } from '../ai';
import { getSubject, getStudyType, MOODS } from '../constants';
import { Icon, TopAppBar, Card, ProgressRing, SectionTitle, AiTipCard, Button } from '../primitives';
import type { TabId } from '../primitives';
import type { StudyMaterial } from '../types';

function mostUrgentMaterial(materials: StudyMaterial[], today: string): { material: StudyMaterial; pace: ReturnType<typeof computeMaterialPace> } | null {
  const candidates = materials
    .map((material) => ({ material, pace: computeMaterialPace(material, today) }))
    .filter((c) => !c.pace.isOverdue && c.pace.remainingScope > 0);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.pace.remainingDays < best.pace.remainingDays ? c : best), candidates[0]);
}

export default function HomeScreen({
  onNavigate,
  onOpenOverlay,
}: {
  onNavigate: (tab: TabId) => void;
  onOpenOverlay: (overlay: 'condition' | 'aiRecommendation') => void;
}) {
  const { state } = useAppState();
  const date = todayKey();
  const condition = state.conditions[date] ?? null;
  const blocks = state.scheduleBlocks[date] ?? [];
  const items = state.plannerItems[date] ?? [];
  const mustDoItem = items.find((i) => i.mustDo && i.status !== 'completed') ?? items.find((i) => i.mustDo) ?? null;

  const { totalFreeMinutes } = getFreeTimeAndSuggestion(blocks, condition);
  const progress = getPlannerProgress(items);
  const tip = getHomeTip(condition, items, mustDoItem);
  const urgent = mostUrgentMaterial(state.studyMaterials, date);

  const profile = state.profile;

  return (
    <div className="px-5 pt-4 pb-10">
      <TopAppBar />

      <p className="text-xs font-semibold text-on-surface-variant mt-2">{formatDateKorean(date)}</p>
      <h1 className="text-xl font-bold text-on-surface mt-1 mb-5 leading-snug">
        안녕하세요{profile && profile.mainSubjects[0] ? `, ${getSubject(profile.mainSubjects[0]).label} 학습자님` : ''}!<br />
        오늘 하루도 화이팅해요.
      </h1>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card tint="primary">
          <Icon name="mood" className="!text-[20px] text-primary mb-1" />
          <p className="text-xs text-on-surface-variant mb-1">오늘 컨디션</p>
          {condition ? (
            <p className="text-base font-bold">{MOODS.find((m) => m.id === condition.mood)?.label ?? '-'}</p>
          ) : (
            <button onClick={() => onOpenOverlay('condition')} className="text-sm font-semibold text-primary underline">
              컨디션 입력하기
            </button>
          )}
        </Card>
        <Card tint="secondary">
          <Icon name="timer" className="!text-[20px] text-secondary mb-1" />
          <p className="text-xs text-on-surface-variant mb-1">공부 가능 시간</p>
          <p className="text-base font-bold">{formatMinutes(totalFreeMinutes)}</p>
        </Card>
      </div>

      <Card className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-on-surface mb-1">플래너 진행률</p>
          <p className="text-xs text-on-surface-variant mb-2">
            {progress.total}개의 계획 중 {progress.completed}개 완료
          </p>
          <button onClick={() => onNavigate('planner')} className="text-xs font-semibold text-primary underline">
            오늘 플래너 보기
          </button>
        </div>
        <ProgressRing percent={progress.percent} />
      </Card>

      {urgent ? (
        <Card className="mb-4">
          <p className="text-xs font-bold text-on-surface-variant mb-1">📐 오늘의 시험 대비 목표</p>
          <p className="text-sm font-bold text-on-surface mb-1">
            {getSubject(urgent.material.subjectId).label} {urgent.material.materialName} {urgent.pace.scopePerSession}p
          </p>
          <p className="text-xs text-on-surface-variant mb-3">
            목표일 {urgent.material.targetDate} · D-{urgent.pace.remainingDays}
          </p>
          <Button
            className="w-full"
            variant="ghost"
            onClick={() => onNavigate('planner')}
          >
            플래너에 반영하기
          </Button>
        </Card>
      ) : (
        <button onClick={() => onNavigate('planner')} className="w-full text-left mb-4">
          <div className="rounded-2xl bg-primary-container/20 border border-primary-container/60 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <Icon name="target" className="!text-[20px] text-on-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">학습 자료 목표</p>
                <p className="text-xs text-on-surface-variant">시험 범위를 등록하면 오늘 할 분량을 알려드려요</p>
              </div>
            </div>
            <Icon name="chevron_right" className="text-primary shrink-0" />
          </div>
        </button>
      )}

      <SectionTitle action={<button onClick={() => onNavigate('check')} className="text-xs font-semibold text-primary">전체보기</button>}>
        필수 과제
      </SectionTitle>
      {mustDoItem ? (
        <Card className="!bg-primary text-on-primary mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs bg-white/20 rounded-full px-2 py-1">{mustDoItem.startTime} 시작</span>
            <Icon name="alarm" />
          </div>
          <p className="text-lg font-bold mb-1">
            {getSubject(mustDoItem.subjectId).label}: {mustDoItem.material || getStudyType(mustDoItem.studyType).label}
          </p>
          <p className="text-sm opacity-90 mb-3">
            {mustDoItem.unit} {mustDoItem.pageRange}
          </p>
          <button onClick={() => onNavigate('check')} className="w-full bg-white text-primary rounded-full py-2.5 text-sm font-bold">
            학습 체크하기
          </button>
        </Card>
      ) : (
        <Card className="mb-5 text-center text-sm text-on-surface-variant py-6">
          아직 오늘의 필수 과제가 없어요.{' '}
          <button onClick={() => onNavigate('planner')} className="text-primary font-semibold underline">
            플래너 만들기
          </button>
        </Card>
      )}

      <AiTipCard text={tip.message} />

      <button onClick={() => onOpenOverlay('aiRecommendation')} className="mt-3 text-xs font-semibold text-primary flex items-center gap-1">
        AI 분석 보기 <Icon name="trending_up" className="!text-[16px]" />
      </button>
    </div>
  );
}
