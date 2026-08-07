import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, monthGrid, addMonthsToKey, getTutoringDaysInRange, getHolidayName, getPlannerProgress } from '../../lib';
import { getSubject } from '../../constants';
import { Icon, Card, TopAppBar } from '../../primitives';
import { DayProgressRing } from '../shared/DayProgressRing';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// 선생님 캘린더 탭과 같은 월간 그리드를 학생 본인 데이터로 읽기 전용 보여준다(과외 요일 설정/일정
// 변경은 선생님 몫이라 편집 버튼은 없다).
export default function StudentCalendarScreen() {
  const { state } = useAppState();
  const today = todayKey();
  const studentId = state.profile?.id ?? '';
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [viewMonthKey, setViewMonthKey] = React.useState(today);

  const grid = monthGrid(viewMonthKey);
  const schedule = state.tutoringSchedules.find((sch) => sch.studentId === studentId);
  const tutoringDays = new Set(
    getTutoringDaysInRange(schedule?.weekdays ?? [], state.tutoringScheduleExceptions, grid[0].key, grid[grid.length - 1].key)
  );

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
        {tutoringDays.has(selectedDate) ? ' · 과외 날' : ''}
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
              <p className="text-sm font-bold">{getSubject(item.subjectId).label}</p>
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
    </div>
  );
}
