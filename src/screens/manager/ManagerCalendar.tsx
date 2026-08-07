import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, monthGrid, addMonthsToKey, getTutoringDaysInRange, getHolidayName, getPlannerProgress } from '../../lib';
import { Icon, BottomSheet, Button, TextField, ChipGroup } from '../../primitives';
import PlannerItemRow from './PlannerItemRow';
import { DayProgressRing } from '../shared/DayProgressRing';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export default function ManagerCalendarScreen({ studentId }: { studentId: string }) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [viewMonthKey, setViewMonthKey] = React.useState(today);
  const [exceptionSheetOpen, setExceptionSheetOpen] = React.useState(false);
  const [exceptionAction, setExceptionAction] = React.useState<'cancel' | 'move'>('cancel');
  const [exceptionNewDate, setExceptionNewDate] = React.useState(today);
  const [scheduleSheetOpen, setScheduleSheetOpen] = React.useState(false);

  React.useEffect(() => {
    actions.loadStudentPlannerItems(studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const grid = monthGrid(viewMonthKey);
  const studentExams = state.examRecords.filter((e) => e.studentId === studentId);
  const examsByDate = new Map<string, typeof studentExams>();
  for (const exam of studentExams) {
    examsByDate.set(exam.examDate, [...(examsByDate.get(exam.examDate) ?? []), exam]);
  }
  const selectedExams = examsByDate.get(selectedDate) ?? [];
  const schedule = state.tutoringSchedules.find((sch) => sch.studentId === studentId);
  const scheduleExceptions = state.tutoringScheduleExceptions.filter((ex) => ex.studentId === studentId);
  const tutoringDays = new Set(
    getTutoringDaysInRange(schedule?.weekdays ?? [], scheduleExceptions, grid[0].key, grid[grid.length - 1].key)
  );
  const [draftWeekdays, setDraftWeekdays] = React.useState<number[]>(schedule?.weekdays ?? []);

  const itemsByDate = state.studentPlannerItems[studentId] ?? {};
  const selectedItems = (itemsByDate[selectedDate] ?? []).slice().sort((a, b) => a.order - b.order);

  const [viewY, viewM] = viewMonthKey.split('-');
  const [selY, selM, selD] = selectedDate.split('-');

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
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
        <button
          onClick={() => {
            setDraftWeekdays(schedule?.weekdays ?? []);
            setScheduleSheetOpen(true);
          }}
          className="text-[11px] text-on-surface-variant underline"
        >
          과외 요일 설정
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

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-primary">
          {selY}년 {Number(selM)}월 {Number(selD)}일{selectedDate === today ? ' (오늘)' : ''}
          {tutoringDays.has(selectedDate) ? ' · 과외 날' : ''}
          {getHolidayName(selectedDate) && <span className="text-error"> · {getHolidayName(selectedDate)}</span>}
          {selectedExams.length > 0 && (
            <span className="text-error"> · {selectedExams.map((e) => `📝 ${e.title}`).join(', ')}</span>
          )}
        </p>
        {tutoringDays.has(selectedDate) && (
          <button
            onClick={() => {
              setExceptionAction('cancel');
              setExceptionNewDate(selectedDate);
              setExceptionSheetOpen(true);
            }}
            className="text-[11px] text-error font-semibold"
          >
            이 날 일정 변경
          </button>
        )}
      </div>

      <div className="space-y-2">
        {selectedItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">이 날 계획된 항목이 없어요.</p>}
        {selectedItems.map((item) => (
          <PlannerItemRow
            key={item.id}
            item={item}
            onSaveAmount={(value) => actions.updateHomeworkAmountForDate(studentId, item.id, selectedDate, item.examSubjectRangeId, value)}
            onDelete={() => {
              if (window.confirm('이 숙제를 삭제할까요?')) actions.deleteStudentHomeworkItem(studentId, selectedDate, item.id);
            }}
          />
        ))}
      </div>

      <BottomSheet open={exceptionSheetOpen} onClose={() => setExceptionSheetOpen(false)} title="과외 일정 변경">
        <div className="space-y-3">
          <ChipGroup
            options={[
              { id: 'cancel', label: '이번만 취소' },
              { id: 'move', label: '다른 날로 변경' },
            ]}
            value={exceptionAction}
            onChange={setExceptionAction}
          />
          {exceptionAction === 'move' && (
            <TextField label="변경할 날짜" type="date" value={exceptionNewDate} onChange={setExceptionNewDate} />
          )}
          <Button
            className="w-full"
            onClick={() => {
              actions.addTutoringException(studentId, {
                originalDate: selectedDate,
                newDate: exceptionAction === 'cancel' ? null : exceptionNewDate,
                note: '',
              });
              setExceptionSheetOpen(false);
            }}
          >
            적용하기
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={scheduleSheetOpen} onClose={() => setScheduleSheetOpen(false)} title="과외 요일 설정">
        <div className="space-y-3">
          <ChipGroup
            multi
            options={[
              { id: '0', label: '일' },
              { id: '1', label: '월' },
              { id: '2', label: '화' },
              { id: '3', label: '수' },
              { id: '4', label: '목' },
              { id: '5', label: '금' },
              { id: '6', label: '토' },
            ]}
            value={draftWeekdays.map(String)}
            onChange={(ids: string[]) => setDraftWeekdays(ids.map(Number))}
          />
          <Button
            className="w-full"
            onClick={() => {
              actions.upsertTutoringSchedule(studentId, draftWeekdays);
              setScheduleSheetOpen(false);
            }}
          >
            저장
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
