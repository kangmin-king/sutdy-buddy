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
import { getSubject } from '../../constants';
import { Icon, Card, TopAppBar, BottomSheet, TextField, Button } from '../../primitives';
import { DayProgressRing } from '../shared/DayProgressRing';
import SchoolTimetableGrid from '../shared/SchoolTimetableGrid';
import type { PlannerItem } from '../../types';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// 선생님 캘린더 탭과 같은 월간 그리드를 학생 본인 데이터로 읽기 전용 보여준다(과외 요일 설정/일정
// 변경은 선생님 몫이라 편집 버튼은 없다).
export default function StudentCalendarScreen() {
  const { state, actions } = useAppState();
  const today = todayKey();
  const studentId = state.profile?.id ?? '';
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [viewMonthKey, setViewMonthKey] = React.useState(today);
  const [timetableSheetOpen, setTimetableSheetOpen] = React.useState(false);
  const [editingCell, setEditingCell] = React.useState<{ weekday: number; period: number; subject: string } | null>(null);

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
        <button onClick={() => setViewMonthKey(addMonthsToKey(viewMonthKey, 1))} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="chevron_right" />
        </button>
      </div>

      <div className="flex justify-end mb-2">
        <button onClick={() => setTimetableSheetOpen(true)} className="text-[11px] text-on-surface-variant underline">
          학교 시간표
        </button>
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
            <div
              className={`w-7 h-7 rounded-md border-2 flex items-center justify-center shrink-0 ${
                item.status === 'completed' ? 'bg-primary border-primary' : 'border-outline-variant'
              }`}
            >
              {item.status === 'completed' && <Icon name="check" className="!text-[18px] text-on-primary" />}
            </div>
          </Card>
        ))}
      </div>

      <BottomSheet open={timetableSheetOpen} onClose={() => setTimetableSheetOpen(false)} title="학교 시간표">
        <p className="text-xs text-on-surface-variant mb-3">칸을 눌러 과목을 입력하세요. 선생님도 이 시간표를 볼 수 있어요.</p>
        <SchoolTimetableGrid
          slots={state.schoolTimetable}
          editable
          onEditCell={(weekday, period, subject) => setEditingCell({ weekday, period, subject })}
        />
      </BottomSheet>

      <BottomSheet
        open={editingCell !== null}
        onClose={() => setEditingCell(null)}
        title={editingCell ? `${WEEKDAY_LABELS[editingCell.weekday - 1]}요일 ${editingCell.period}교시` : undefined}
      >
        {editingCell && (
          <div className="space-y-3">
            <TextField
              label="과목"
              value={editingCell.subject}
              onChange={(value) => setEditingCell((c) => c && { ...c, subject: value })}
              placeholder="예: 수학"
            />
            <Button
              className="w-full"
              onClick={() => {
                actions.upsertSchoolTimetableSlot(editingCell.weekday, editingCell.period, editingCell.subject);
                setEditingCell(null);
              }}
            >
              저장
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
