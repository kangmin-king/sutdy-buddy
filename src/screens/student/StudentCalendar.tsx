import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import {
  todayKey,
  monthGrid,
  addMonthsToKey,
  getTutoringDaysInRange,
  getHolidayName,
  getPlannerProgress,
  resolvePlannerItemManagerId,
  managerDisplayLabel,
} from '../../lib';
import { getSubject, SUBJECTS } from '../../constants';
import { Icon, Card, TopAppBar, BottomSheet, TextField, Button, ChipGroup, SectionTitle, useConfirm } from '../../primitives';
import { DayProgressRing } from '../shared/DayProgressRing';
import ChecklistTimeline from '../shared/ChecklistTimeline';
import ExamSchedule from './ExamSchedule';
import type { PlannerItem, SubjectId } from '../../types';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// 선생님 캘린더 탭과 같은 월간 그리드를 학생 본인 데이터로 보여준다(과외 요일 설정/일정 변경은
// 선생님 몫이라 그건 여전히 읽기 전용이다). 계획 추가는 여기서 할 수 있다 — 예전엔 홈의 빈 상태가
// "캘린더에서 오늘 계획을 추가할 수 있어요"라고 안내하는데 정작 이 화면엔 추가 수단이 없어서
// 신규 학생이 그 안내를 따라오면 막혔다. 학교 시간표는 "나" 탭으로 옮겼다.
export default function StudentCalendarScreen() {
  const { state, actions } = useAppState();
  const { confirm, confirmDialog } = useConfirm();
  const today = todayKey();
  const studentId = state.profile?.id ?? '';
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [viewMonthKey, setViewMonthKey] = React.useState(today);
  const [addOpen, setAddOpen] = React.useState(false);
  const [draftSubject, setDraftSubject] = React.useState<SubjectId>('math');
  const [draftMaterial, setDraftMaterial] = React.useState('');
  const [draftStart, setDraftStart] = React.useState('09:00');
  const [draftEnd, setDraftEnd] = React.useState('');

  const grid = monthGrid(viewMonthKey);
  // 학생 한 명에게 선생님이 여러 명 연결될 수 있으므로, 과외 요일도 선생님별로 따로 계산해서 합친다
  // (예외도 그 선생님이 낸 것만 반영 — 안 그러면 다른 선생님의 취소/변경이 잘못 섞여 들어간다).
  const schedules = state.tutoringSchedules.filter((sch) => sch.studentId === studentId);
  const tutoringDaysByManager = new Map<string, Set<string>>();
  for (const schedule of schedules) {
    const managerExceptions = state.tutoringScheduleExceptions.filter((ex) => ex.managerId === schedule.managerId);
    const days = getTutoringDaysInRange(schedule.weekdays, managerExceptions, grid[0].key, grid[grid.length - 1].key);
    tutoringDaysByManager.set(schedule.managerId, new Set(days));
  }
  const tutoringDays = new Set<string>();
  for (const days of tutoringDaysByManager.values()) {
    for (const day of days) tutoringDays.add(day);
  }
  const managerLabelFor = (item: PlannerItem) => {
    const managerId = resolvePlannerItemManagerId(item, state);
    if (!managerId) return null;
    const index = state.linkedManagers.findIndex((m) => m.id === managerId);
    return managerDisplayLabel(managerId, state.managerLabels, index);
  };
  const tutoringManagerLabelsFor = (dateKey: string) =>
    schedules
      .filter((sch) => tutoringDaysByManager.get(sch.managerId)?.has(dateKey))
      .map((sch) => managerDisplayLabel(sch.managerId, state.managerLabels, state.linkedManagers.findIndex((m) => m.id === sch.managerId)));

  const examsByDate = new Map<string, typeof state.examRecords>();
  for (const exam of state.examRecords) {
    examsByDate.set(exam.examDate, [...(examsByDate.get(exam.examDate) ?? []), exam]);
  }
  const selectedExams = examsByDate.get(selectedDate) ?? [];

  const itemsByDate = state.plannerItems;
  const selectedItems = (itemsByDate[selectedDate] ?? []).slice().sort((a, b) => a.order - b.order);

  const [viewY, viewM] = viewMonthKey.split('-');
  const [selY, selM, selD] = selectedDate.split('-');

  const addPlanToSelectedDate = () => {
    if (!draftMaterial.trim()) return;
    actions.addPlannerItem(selectedDate, {
      date: selectedDate,
      subjectId: draftSubject,
      startTime: draftStart,
      studyType: null,
      material: draftMaterial.trim(),
      unit: '',
      pageRange: '',
      endTime: draftEnd || null,
      difficulty: null,
      restPattern: null,
      mustDo: false,
      status: 'planned',
      actualMinutes: null,
      understanding: null,
      partialReason: null,
      incompleteReason: null,
      source: 'self',
      homeworkAssignmentId: null,
      examSubjectRangeId: null,
    });
    setDraftMaterial('');
    setDraftEnd('');
    setAddOpen(false);
  };

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar compact />
      <div className="flex items-center justify-between mt-2 mb-3">
        <button onClick={() => setViewMonthKey(addMonthsToKey(viewMonthKey, -1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="chevron_left" />
        </button>
        <p className="text-base font-bold">
          {viewY}년 {Number(viewM)}월
        </p>
        <button onClick={() => setViewMonthKey(addMonthsToKey(viewMonthKey, 1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="chevron_right" />
        </button>
      </div>

      {/*
        날짜 한 칸이 선택·오늘·과외날·공휴일·시험·계획있음·완료율 일곱 가지를 색과 테두리로
        동시에 표현한다. 설명이 없으면 읽을 수 없어서 범례를 붙인다.
      */}
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5 rounded-xl bg-surface-container-low px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-on-surface-variant">
          <span className="h-3 w-3 rounded-full bg-tertiary-container/40" />과외 날
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-on-surface-variant">
          <span className="h-3 w-3 rounded-full ring-2 ring-error ring-inset" />시험
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-on-surface-variant">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" />계획 있음
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-on-surface-variant">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: 'conic-gradient(rgb(var(--warning)) 0% 65%, rgb(var(--surface-container-highest)) 65% 100%)' }}
          />
          지난 날 완료율
        </span>
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
          const isTutoringDay = tutoringDays.has(d.key);
          const isRedDay = d.isSunday || getHolidayName(d.key) !== null;
          const dayItems = itemsByDate[d.key] ?? [];
          const hasItems = dayItems.length > 0;
          const hasExam = examsByDate.has(d.key);
          const percent = d.key < today && dayItems.length > 0 ? getPlannerProgress(dayItems).percent : null;
          return (
            <button key={d.key} onClick={() => setSelectedDate(d.key)} className="flex flex-col items-center py-1.5">
              <DayProgressRing percent={percent}>
                <span
                  className={`relative w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                    isSelected
                      ? 'bg-primary text-on-primary font-bold'
                      : isTutoringDay
                        ? `bg-tertiary-container/40 ${isRedDay ? 'text-error' : 'text-on-surface'}`
                        : isToday
                          ? 'border border-primary text-primary font-semibold'
                          : d.inCurrentMonth
                            ? isRedDay
                              ? 'text-error'
                              : 'text-on-surface'
                            : isRedDay
                              ? 'text-error/40'
                              : 'text-outline-variant'
                  } ${hasExam ? 'ring-2 ring-error' : ''}`}
                >
                  {d.date}
                </span>
              </DayProgressRing>
              <span className="flex items-center gap-0.5 mt-0.5 h-1">
                {hasItems && d.key >= today && <span className="w-1 h-1 rounded-full bg-secondary" />}
                {hasExam && <span className="w-1 h-1 rounded-full bg-error" />}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs font-semibold text-primary mb-3">
        {selY}년 {Number(selM)}월 {Number(selD)}일{selectedDate === today ? ' (오늘)' : ''}
        {tutoringDays.has(selectedDate) ? ` · 과외 날 · ${tutoringManagerLabelsFor(selectedDate).join(', ')}` : ''}
        {getHolidayName(selectedDate) && <span className="text-error"> · {getHolidayName(selectedDate)}</span>}
        {selectedExams.length > 0 && (
          <span className="text-error"> · {selectedExams.map((e) => `📝 ${e.title}`).join(', ')}</span>
        )}
      </p>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-on-surface">이 날 계획</h2>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs font-bold text-primary transition active:scale-[0.96]"
        >
          <Icon name="add_circle" className="!text-[18px]" />
          추가
        </button>
      </div>

      <div className="space-y-2">
        {selectedItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">이 날 계획된 항목이 없어요.</p>}
        {selectedItems.map((item) => (
          <Card key={item.id} className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">
                {getSubject(item.subjectId).label}
                {managerLabelFor(item) && <span className="text-[10px] text-tertiary ml-1">· {managerLabelFor(item)}</span>}
              </p>
              <p className="text-xs text-on-surface-variant">{item.material || item.pageRange || '할 일'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div
                className={`w-7 h-7 rounded-md border-2 flex items-center justify-center shrink-0 ${
                  item.status === 'completed' ? 'bg-primary border-primary' : 'border-outline-variant'
                }`}
              >
                {item.status === 'completed' && <Icon name="check" className="!text-[18px] text-on-primary" />}
              </div>
              {/* 이 화면에서 추가할 수 있게 됐으니 지울 수도 있어야 한다 — 안 그러면 여기서 만든
                  미래 날짜 계획을 없앨 방법이 어디에도 없다. 숙제는 학생이 못 지운다. */}
              {item.source !== 'homework' && (
                <button
                  onClick={async () => {
                    const label = `${getSubject(item.subjectId).label}${item.material ? ` · ${item.material}` : ''}`;
                    if (await confirm(`"${label}" 계획을 삭제할까요?`)) actions.deletePlannerItem(selectedDate, item.id);
                  }}
                  aria-label={`${getSubject(item.subjectId).label} 계획 삭제`}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-on-surface-variant transition hover:bg-surface-container active:scale-[0.94]"
                >
                  <Icon name="close" className="!text-[18px]" />
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* 예전엔 플래너 탭 하단에 "오늘" 타임라인만 있었다 — 날짜에 딸린 정보라 캘린더로 옮기고
          선택한 날짜 기준으로 보여준다. 색 편집은 오늘 것에서만 의미가 있어 그대로 열어 둔다. */}
      {selectedItems.length > 0 && (
        <div className="mt-6">
          <SectionTitle>{selectedDate === today ? '오늘 타임라인' : '이 날 타임라인'}</SectionTitle>
          <ChecklistTimeline
            items={selectedItems}
            studySessions={state.studySessions}
            customColors={state.profile?.subjectColors}
            editable={selectedDate === today}
            onChangeSubjectColor={(subjectId, color) => actions.updateSubjectColor(subjectId, color)}
            managerLabelFor={managerLabelFor}
            allowedAppIntervals={state.allowedAppIntervals[studentId] ?? []}
          />
        </div>
      )}

      <div className="mt-6">
        <ExamSchedule />
      </div>

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title={`${Number(selM)}월 ${Number(selD)}일 계획 추가`}>
        <div className="space-y-3">
          <ChipGroup options={SUBJECTS} value={draftSubject} onChange={setDraftSubject} />
          <TextField label="뭐 할지" value={draftMaterial} onChange={setDraftMaterial} placeholder="예: 수학 익힘책 2단원" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="시작" type="time" value={draftStart} onChange={setDraftStart} />
            <TextField label="종료" type="time" value={draftEnd} onChange={setDraftEnd} />
          </div>
          <Button className="w-full" onClick={addPlanToSelectedDate} disabled={!draftMaterial.trim()}>
            추가하기
          </Button>
        </div>
      </BottomSheet>

      {confirmDialog}
    </div>
  );
}
