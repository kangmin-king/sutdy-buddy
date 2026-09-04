import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, monthGrid, addMonthsToKey, getTutoringDaysInRange, getHolidayName, getPlannerProgress } from '../../lib';
import { Icon, BottomSheet, Button, TextField, ChipGroup, ToggleSwitch, useConfirm } from '../../primitives';
import { SUBJECTS, getSubject, DEFAULT_HOMEWORK_REMIND_AT } from '../../constants';
import PlannerItemRow from './PlannerItemRow';
import { DayProgressRing } from '../shared/DayProgressRing';
import SchoolTimetableGrid from '../shared/SchoolTimetableGrid';
import type { SubjectId } from '../../types';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export default function ManagerCalendarScreen({
  studentId,
  openReminderSheet = false,
  onReminderSheetOpened,
}: {
  studentId: string;
  /** 학생 목록의 알림 칩에서 들어왔을 때 true — 마운트 직후 미시작 알림 시트를 펼친다. */
  openReminderSheet?: boolean;
  onReminderSheetOpened?: () => void;
}) {
  const { state, actions } = useAppState();
  const { confirm, confirmDialog } = useConfirm();
  const today = todayKey();
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [viewMonthKey, setViewMonthKey] = React.useState(today);
  const [exceptionSheetOpen, setExceptionSheetOpen] = React.useState(false);
  const [exceptionAction, setExceptionAction] = React.useState<'cancel' | 'move'>('cancel');
  const [exceptionNewDate, setExceptionNewDate] = React.useState(today);
  const [scheduleSheetOpen, setScheduleSheetOpen] = React.useState(false);
  const [proposalSheetOpen, setProposalSheetOpen] = React.useState(false);
  const [proposalSubjectId, setProposalSubjectId] = React.useState<SubjectId>('math');
  const [proposalMaterial, setProposalMaterial] = React.useState('');
  const [proposalPageRange, setProposalPageRange] = React.useState('');
  const [timetableSheetOpen, setTimetableSheetOpen] = React.useState(false);
  const [reminderSheetOpen, setReminderSheetOpen] = React.useState(false);
  const [draftRemindAt, setDraftRemindAt] = React.useState(DEFAULT_HOMEWORK_REMIND_AT);
  const [draftReminderEnabled, setDraftReminderEnabled] = React.useState(true);

  React.useEffect(() => {
    actions.loadStudentPlannerItems(studentId);
    actions.loadSentHomeworkProposals(studentId);
    actions.loadStudentSchoolTimetable(studentId);
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
  // 설정 행이 없는 학생은 기본값으로 동작한다(0023 마이그레이션) — 화면에도 같은 값을 보여준다.
  const reminderSetting = state.homeworkReminderSettings[studentId];
  const remindAt = reminderSetting?.remindAt ?? DEFAULT_HOMEWORK_REMIND_AT;
  const reminderEnabled = reminderSetting?.enabled ?? true;

  // 학생 목록의 알림 칩으로 들어온 경우. 한 번 펼치면 부모의 신호를 지워서, 시트를 닫고
  // 다른 걸 만지다가 이 화면이 다시 그려질 때 또 열리지 않게 한다.
  React.useEffect(() => {
    if (!openReminderSheet) return;
    setDraftRemindAt(remindAt);
    setDraftReminderEnabled(reminderEnabled);
    setReminderSheetOpen(true);
    onReminderSheetOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReminderSheet, studentId]);

  const itemsByDate = state.studentPlannerItems[studentId] ?? {};
  const selectedItems = (itemsByDate[selectedDate] ?? []).slice().sort((a, b) => a.order - b.order);
  const selectedDateProposals = (state.sentHomeworkProposals[studentId] ?? []).filter((p) => p.date === selectedDate);
  const proposalStatusLabel = { pending: '대기중', accepted: '수락됨', rejected: '거절됨' } as const;
  const proposalStatusColor = { pending: 'text-tertiary', accepted: 'text-secondary', rejected: 'text-error' } as const;

  const [viewY, viewM] = viewMonthKey.split('-');
  const [selY, selM, selD] = selectedDate.split('-');

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between mt-2 mb-3">
        <button
          onClick={() => setViewMonthKey(addMonthsToKey(viewMonthKey, -1))}
          aria-label="이전 달"
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-container active:scale-[0.94]"
        >
          <Icon name="chevron_left" />
        </button>
        <p className="text-base font-bold">
          {viewY}년 {Number(viewM)}월
        </p>
        <button
          onClick={() => setViewMonthKey(addMonthsToKey(viewMonthKey, 1))}
          aria-label="다음 달"
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-container active:scale-[0.94]"
        >
          <Icon name="chevron_right" />
        </button>
      </div>

      {/* 예전엔 화면마다 작은 밑줄 텍스트 링크로 흩어져 있던 기능들이라 있는지도 잘 몰랐다는
          피드백을 받았다. 항상 같은 자리, 같은 아이콘으로 보이게 한 줄로 모았다. */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <button
          onClick={() => {
            setProposalSubjectId('math');
            setProposalMaterial('');
            setProposalPageRange('');
            setProposalSheetOpen(true);
          }}
          className="flex flex-col items-center gap-1 py-2 rounded-2xl bg-surface-container"
        >
          <Icon name="assignment_add" className="!text-[20px] text-primary" />
          <span className="text-[11px] text-on-surface-variant">숙제 제안</span>
        </button>
        <button onClick={() => setTimetableSheetOpen(true)} className="flex flex-col items-center gap-1 py-2 rounded-2xl bg-surface-container">
          <Icon name="schedule" className="!text-[20px] text-primary" />
          <span className="text-[11px] text-on-surface-variant">시간표</span>
        </button>
        <button
          onClick={() => {
            setDraftWeekdays(schedule?.weekdays ?? []);
            setScheduleSheetOpen(true);
          }}
          className="flex flex-col items-center gap-1 py-2 rounded-2xl bg-surface-container"
        >
          <Icon name="event_repeat" className="!text-[20px] text-primary" />
          <span className="text-[11px] text-on-surface-variant">요일 설정</span>
        </button>
        <button
          onClick={() => {
            setDraftRemindAt(remindAt);
            setDraftReminderEnabled(reminderEnabled);
            setReminderSheetOpen(true);
          }}
          className="flex flex-col items-center gap-1 py-2 rounded-2xl bg-surface-container"
        >
          <Icon
            name={reminderEnabled ? 'notifications_active' : 'notifications_off'}
            className={`!text-[20px] ${reminderEnabled ? 'text-primary' : 'text-on-surface-variant'}`}
          />
          <span className="text-[11px] text-on-surface-variant">{reminderEnabled ? `미시작 ${remindAt}` : '미시작 알림'}</span>
        </button>
      </div>

      {/*
        날짜 한 칸이 선택·오늘·과외날·공휴일·시험·숙제있음·이행률 일곱 가지를 색과 테두리로
        동시에 표현한다. 설명이 없으면 읽을 수 없어서 범례를 붙인다(학생 캘린더와 같은 형식).
      */}
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5 rounded-xl bg-surface-container-low px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
          <span className="h-3 w-3 rounded-full bg-tertiary-container/40" />과외 날
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
          <span className="h-3 w-3 rounded-full ring-2 ring-error ring-inset" />시험
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" />숙제 있음
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: 'conic-gradient(rgb(var(--warning)) 0% 65%, rgb(var(--surface-container-highest)) 65% 100%)' }}
          />
          지난 날 이행률
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

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-primary">
          {selY}년 {Number(selM)}월 {Number(selD)}일{selectedDate === today ? ' (오늘)' : ''}
          {tutoringDays.has(selectedDate) ? ' · 과외 날' : ''}
          {getHolidayName(selectedDate) && <span className="text-error"> · {getHolidayName(selectedDate)}</span>}
          {selectedExams.length > 0 && (
            <span className="text-error"> · {selectedExams.map((e) => `📝 ${e.title}`).join(', ')}</span>
          )}
        </p>
        <div className="flex items-center gap-3 shrink-0">
          {tutoringDays.has(selectedDate) && (
            <button
              onClick={() => {
                setExceptionAction('cancel');
                setExceptionNewDate(selectedDate);
                setExceptionSheetOpen(true);
              }}
              className="min-h-11 shrink-0 rounded-xl px-2 text-[11px] font-bold text-error transition active:scale-[0.96]"
            >
              이 날 일정 변경
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {selectedItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">이 날 계획된 항목이 없어요.</p>}
        {selectedItems.map((item) => (
          <PlannerItemRow
            key={item.id}
            item={item}
            onSaveAmount={(value) => actions.updateHomeworkAmountForDate(studentId, item.id, selectedDate, item.examSubjectRangeId, value)}
            onDelete={async () => {
              if (await confirm('이 숙제를 삭제할까요?')) actions.deleteStudentHomeworkItem(studentId, selectedDate, item.id);
            }}
          />
        ))}
      </div>

      {selectedDateProposals.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-on-surface-variant">이 날 제안한 숙제</p>
          {selectedDateProposals.map((p) => (
            <div key={p.id} className="rounded-xl bg-surface-container-high px-4 py-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold min-w-0 truncate">
                {getSubject(p.subjectId).label} · {p.material || p.pageRange || '할 일'}
              </p>
              <span className={`text-xs font-semibold shrink-0 ${proposalStatusColor[p.status]}`}>{proposalStatusLabel[p.status]}</span>
            </div>
          ))}
        </div>
      )}

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
      <BottomSheet open={proposalSheetOpen} onClose={() => setProposalSheetOpen(false)} title="숙제 제안하기">
        <div className="space-y-3">
          <p className="text-xs text-on-surface-variant">
            {selY}년 {Number(selM)}월 {Number(selD)}일에 추가로 할 숙제를 제안해요. 학생이 수락하면 그날 할 일에 들어가요.
          </p>
          <ChipGroup options={SUBJECTS} value={proposalSubjectId} onChange={setProposalSubjectId} />
          <TextField label="교재/내용" value={proposalMaterial} onChange={setProposalMaterial} placeholder="예: 쎈 수학" />
          <TextField label="범위 (선택)" value={proposalPageRange} onChange={setProposalPageRange} placeholder="예: 30~40페이지" />
          <Button
            className="w-full"
            onClick={() => {
              actions.createHomeworkProposal(studentId, {
                date: selectedDate,
                subjectId: proposalSubjectId,
                material: proposalMaterial,
                pageRange: proposalPageRange,
              });
              setProposalSheetOpen(false);
            }}
          >
            제안 보내기
          </Button>
        </div>
      </BottomSheet>
      <BottomSheet open={reminderSheetOpen} onClose={() => setReminderSheetOpen(false)} title="숙제 미시작 알림">
        <div className="space-y-3">
          <p className="text-xs text-on-surface-variant">
            이 시각까지 오늘 숙제를 <b>하나도 시작하지 않으면</b> 알림을 보내요. 하루에 한 번만 오고, 학생이 시작만 해도
            오지 않아요. 오늘 배정된 숙제가 없는 날은 보내지 않아요.
          </p>
          <ToggleSwitch label="알림 받기" checked={draftReminderEnabled} onChange={setDraftReminderEnabled} />
          {draftReminderEnabled && <TextField label="알림 시각" type="time" value={draftRemindAt} onChange={setDraftRemindAt} />}
          <Button
            className="w-full"
            onClick={() => {
              actions.upsertHomeworkReminderSetting(studentId, { remindAt: draftRemindAt, enabled: draftReminderEnabled });
              setReminderSheetOpen(false);
            }}
          >
            저장
          </Button>
        </div>
      </BottomSheet>
      <BottomSheet open={timetableSheetOpen} onClose={() => setTimetableSheetOpen(false)} title="학교 시간표">
        {(state.studentSchoolTimetables[studentId] ?? []).length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-6">학생이 아직 시간표를 등록하지 않았어요.</p>
        ) : (
          <SchoolTimetableGrid slots={state.studentSchoolTimetables[studentId] ?? []} />
        )}
      </BottomSheet>
      {confirmDialog}
    </div>
  );
}
