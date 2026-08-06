import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, monthGrid, addMonthsToKey, getTutoringDaysInRange, getHolidayName } from '../../lib';
import { SUBJECTS, getSubject } from '../../constants';
import { Card, Button, TextField, ToggleSwitch, ChipGroup, SectionTitle, Icon } from '../../primitives';
import type { SubjectId } from '../../types';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

// range_label은 페이지 모드면 "10~50페이지", 자유 입력 모드면 관리자가 쓴 문구 그대로 저장된다.
// 수정 폼을 열 때 어느 모드였는지 문구만 보고 되짚는다(별도 모드 컬럼 없이 형식으로 구분).
function parseRangeLabel(rangeLabel: string): { mode: 'pages'; startPage: string; endPage: string } | { mode: 'custom'; customLabel: string } {
  const match = rangeLabel.match(/^(\d+)~(\d+)페이지$/);
  return match ? { mode: 'pages', startPage: match[1], endPage: match[2] } : { mode: 'custom', customLabel: rangeLabel };
}

// 캘린더 탭과 같은 월별 그리드 디자인을 그대로 쓰되, 날짜를 여러 개 탭으로 선택하는 용도로 축소한
// 버전. lockedDates(이미 지났거나 완료된 날짜)는 항상 선택된 것처럼 보이되 탭해도 바뀌지 않는다.
function CompactMonthPicker({
  viewMonthKey,
  onViewMonthChange,
  selectedDates,
  onToggleDate,
  tutoringDays,
  lockedDates = new Set<string>(),
  minDate,
}: {
  viewMonthKey: string;
  onViewMonthChange: (key: string) => void;
  selectedDates: string[];
  onToggleDate: (date: string) => void;
  tutoringDays: Set<string>;
  lockedDates?: Set<string>;
  minDate?: string;
}) {
  const grid = monthGrid(viewMonthKey);
  const today = todayKey();
  const [viewY, viewM] = viewMonthKey.split('-');
  const selectedSet = new Set(selectedDates);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onViewMonthChange(addMonthsToKey(viewMonthKey, -1))} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="chevron_left" className="!text-[18px]" />
        </button>
        <p className="text-xs font-bold">
          {viewY}년 {Number(viewM)}월
        </p>
        <button onClick={() => onViewMonthChange(addMonthsToKey(viewMonthKey, 1))} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-container">
          <Icon name="chevron_right" className="!text-[18px]" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-0.5">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[10px] text-on-surface-variant py-0.5">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map((d) => {
          const isLocked = lockedDates.has(d.key);
          const isSelected = isLocked || selectedSet.has(d.key);
          const isDisabled = !isLocked && minDate !== undefined && d.key < minDate;
          const isTutoringDay = tutoringDays.has(d.key);
          const isToday = d.key === today;
          const isRedDay = d.isSunday || getHolidayName(d.key) !== null;
          return (
            <button
              key={d.key}
              disabled={isDisabled}
              onClick={() => !isLocked && !isDisabled && onToggleDate(d.key)}
              className="flex items-center justify-center py-0.5"
            >
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-full text-[11px] ${
                  isSelected
                    ? isLocked
                      ? 'bg-outline-variant text-on-surface font-semibold'
                      : 'bg-primary text-on-primary font-bold'
                    : isTutoringDay
                      ? `bg-tertiary-container/40 ${isRedDay ? 'text-error' : 'text-on-surface'}`
                      : isToday
                        ? 'border border-primary text-primary font-semibold'
                        : isDisabled
                          ? 'text-outline-variant/50'
                          : isRedDay
                            ? d.inCurrentMonth
                              ? 'text-error'
                              : 'text-error/40'
                            : d.inCurrentMonth
                              ? 'text-on-surface'
                              : 'text-outline-variant'
                }`}
              >
                {d.date}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-on-surface-variant mt-1">
        진한 표시 칸 = 과외 날짜 · 빨간 숫자 = 공휴일/일요일{lockedDates.size > 0 ? ' · 회색 = 이미 지났거나 완료돼 수정할 수 없는 날' : ''}
      </p>
    </div>
  );
}

export default function ManagerProgressScreen({ studentId }: { studentId: string }) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const [showExamForm, setShowExamForm] = React.useState(false);
  const [examTitle, setExamTitle] = React.useState('');
  const [examDate, setExamDate] = React.useState(today);
  const [examIsMain, setExamIsMain] = React.useState(false);
  const [selectedExamId, setSelectedExamId] = React.useState<string | null>(null);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [targetGrade, setTargetGrade] = React.useState('');
  const [targetScore, setTargetScore] = React.useState('');
  const [targetRank, setTargetRank] = React.useState('');

  // 교재 등록/수정 폼 — 둘이 같은 필드를 쓰되 editingRangeId가 있으면 수정 모드.
  const [rangeSubjectId, setRangeSubjectId] = React.useState<string | null>(null);
  const [editingRangeId, setEditingRangeId] = React.useState<string | null>(null);
  const [material, setMaterial] = React.useState('');
  const [rangeMode, setRangeMode] = React.useState<'pages' | 'custom'>('pages');
  const [startPage, setStartPage] = React.useState('');
  const [endPage, setEndPage] = React.useState('');
  const [customLabel, setCustomLabel] = React.useState('');
  const [selectedDates, setSelectedDates] = React.useState<string[]>([]);
  const [viewMonthKey, setViewMonthKey] = React.useState(today);

  React.useEffect(() => {
    actions.loadStudentPlannerItems(studentId);
    // studentId 바뀔 때만 다시 불러온다 — actions는 매 렌더 재생성되므로 deps에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const studentExams = state.examRecords.filter((e) => e.studentId === studentId);
  const selectedExam = studentExams.find((e) => e.id === selectedExamId) ?? null;
  const subjectsForExam = state.examSubjects.filter((s) => s.examId === selectedExamId);

  const schedule = state.tutoringSchedules.find((sch) => sch.studentId === studentId);
  const scheduleExceptions = state.tutoringScheduleExceptions.filter((ex) => ex.studentId === studentId);
  const grid = monthGrid(viewMonthKey);
  const tutoringDays = new Set(getTutoringDaysInRange(schedule?.weekdays ?? [], scheduleExceptions, grid[0].key, grid[grid.length - 1].key));

  const itemsByDate = state.studentPlannerItems[studentId] ?? {};
  const allStudentItems = React.useMemo(() => Object.values(itemsByDate).flat(), [itemsByDate]);

  // 수정 중인 범위가 이미 만든 항목 중 "잠긴"(과거이거나 완료된) 날짜 — 항상 선택된 것으로 표시하고
  // 탭해도 바뀌지 않는다. registerHomeworkRange/updateHomeworkRange 액션의 판단 기준과 동일하다.
  const lockedDates = React.useMemo(() => {
    if (!editingRangeId) return new Set<string>();
    const locked = allStudentItems.filter(
      (i) => i.examSubjectRangeId === editingRangeId && (i.date < today || i.status === 'completed')
    );
    return new Set(locked.map((i) => i.date));
  }, [editingRangeId, allStudentItems, today]);

  const closeRangeForm = () => {
    setRangeSubjectId(null);
    setEditingRangeId(null);
    setMaterial('');
    setRangeMode('pages');
    setStartPage('');
    setEndPage('');
    setCustomLabel('');
    setSelectedDates([]);
  };

  const startRegisterRange = (subjectRecordId: string) => {
    if (rangeSubjectId === subjectRecordId) {
      closeRangeForm();
      return;
    }
    setRangeSubjectId(subjectRecordId);
    setEditingRangeId(null);
    setMaterial('');
    setRangeMode('pages');
    setStartPage('');
    setEndPage('');
    setCustomLabel('');
    setSelectedDates([]);
    setViewMonthKey(today);
  };

  const startEditRange = (rangeId: string, subjectRecordId: string) => {
    const range = state.examSubjectRanges.find((r) => r.id === rangeId);
    if (!range) return;
    if (editingRangeId === rangeId) {
      closeRangeForm();
      return;
    }
    const parsed = parseRangeLabel(range.rangeLabel);
    setEditingRangeId(rangeId);
    setRangeSubjectId(subjectRecordId);
    setMaterial(range.material);
    setRangeMode(parsed.mode);
    setStartPage(parsed.mode === 'pages' ? parsed.startPage : '');
    setEndPage(parsed.mode === 'pages' ? parsed.endPage : '');
    setCustomLabel(parsed.mode === 'custom' ? parsed.customLabel : '');
    setSelectedDates(range.assignedDates);
    setViewMonthKey(range.assignedDates[0] ?? today);
  };

  const toggleDate = (date: string) => {
    setSelectedDates((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]));
  };

  const submitRange = () => {
    if (!rangeSubjectId || !material.trim()) return;
    const scope: { mode: 'pages'; startPage: number; endPage: number } | { mode: 'custom'; customLabel: string } | null =
      rangeMode === 'pages'
        ? startPage.trim() && endPage.trim() && Number(startPage) <= Number(endPage)
          ? { mode: 'pages', startPage: Number(startPage), endPage: Number(endPage) }
          : null
        : customLabel.trim()
          ? { mode: 'custom', customLabel: customLabel.trim() }
          : null;
    if (!scope) return;

    if (editingRangeId) {
      if (selectedDates.length === 0 && lockedDates.size === 0) return;
      actions.updateHomeworkRange(studentId, editingRangeId, { material, selectedDates, ...scope });
    } else {
      if (selectedDates.length === 0) return;
      const subject = subjectsForExam.find((s) => s.id === rangeSubjectId);
      if (!subject) return;
      actions.registerHomeworkRange(studentId, rangeSubjectId, { subjectId: subject.subjectId, material, selectedDates, ...scope });
    }
    closeRangeForm();
  };

  const submitExam = async () => {
    if (!examTitle.trim()) return;
    const id = await actions.createExamRecord(studentId, { title: examTitle, examDate, isMain: examIsMain });
    setExamTitle('');
    setExamIsMain(false);
    setShowExamForm(false);
    setSelectedExamId(id);
  };

  const submitSubject = () => {
    if (!selectedExamId || !targetGrade.trim()) return;
    actions.addExamSubject(selectedExamId, { subjectId, targetGrade, targetScore, targetRank });
    setTargetGrade('');
    setTargetScore('');
    setTargetRank('');
  };

  return (
    <div className="px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <SectionTitle
        action={
          <button onClick={() => setShowExamForm((s) => !s)} className="text-primary text-xs font-semibold">
            + 시험 추가
          </button>
        }
      >
        시험/평가
      </SectionTitle>

      {showExamForm && (
        <Card className="mb-4 space-y-3">
          <TextField label="시험명" value={examTitle} onChange={setExamTitle} placeholder="예: 2학기 중간고사" />
          <TextField label="시험일" type="date" value={examDate} onChange={setExamDate} />
          <ToggleSwitch label="메인 시험으로 지정" checked={examIsMain} onChange={setExamIsMain} />
          <Button className="w-full" onClick={submitExam}>
            추가하기
          </Button>
        </Card>
      )}

      <div className="flex gap-2 overflow-x-auto mb-4">
        {studentExams.length === 0 && <p className="text-sm text-on-surface-variant py-2">등록된 시험이 없어요.</p>}
        {studentExams.map((exam) => (
          <button
            key={exam.id}
            onClick={() => setSelectedExamId(exam.id)}
            className={`shrink-0 rounded-xl px-4 py-3 text-left ${
              exam.id === selectedExamId ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest shadow-card'
            }`}
          >
            <p className="text-sm font-bold">
              {exam.title} {exam.isMain && '⭐'}
            </p>
            <p className="text-xs opacity-80">{exam.examDate}</p>
          </button>
        ))}
      </div>

      {selectedExam && (
        <>
          <SectionTitle>과목별 목표</SectionTitle>
          <Card className="mb-4 space-y-3">
            <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
            <div className="grid grid-cols-3 gap-2">
              <TextField label="목표 등급" value={targetGrade} onChange={setTargetGrade} placeholder="1등급" />
              <TextField label="목표 점수" value={targetScore} onChange={setTargetScore} placeholder="90점" />
              <TextField label="목표 등수" value={targetRank} onChange={setTargetRank} placeholder="반 3등" />
            </div>
            <Button className="w-full" onClick={submitSubject}>
              과목 추가
            </Button>
          </Card>

          <div className="space-y-2">
            {subjectsForExam.map((subject) => {
              const ranges = state.examSubjectRanges.filter((r) => r.examSubjectId === subject.id);
              return (
                <Card key={subject.id} className="mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">{getSubject(subject.subjectId).label}</p>
                      <p className="text-xs text-on-surface-variant">
                        {subject.targetGrade} · {subject.targetScore} · {subject.targetRank}
                      </p>
                    </div>
                    <button onClick={() => startRegisterRange(subject.id)} className="text-xs font-semibold text-primary">
                      교재 등록
                    </button>
                  </div>

                  {rangeSubjectId === subject.id && (
                    <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-3">
                      {editingRangeId && (
                        <p className="text-[11px] text-on-surface-variant">
                          이미 지났거나 완료된 날짜는 그대로 두고, 남은 날짜만 새로 나눠서 반영해요. 범위/내용도 남은 만큼 다시 입력해주세요.
                        </p>
                      )}
                      <TextField label="교재명" value={material} onChange={setMaterial} placeholder="예: 쎈 수학 (상)" />
                      <div>
                        <div className="flex items-center gap-1 mb-1.5">
                          <span className="text-sm font-semibold text-on-surface-variant">
                            {rangeMode === 'pages' ? '페이지 범위' : '학습 내용'}
                          </span>
                          <button
                            onClick={() => setRangeMode((m) => (m === 'pages' ? 'custom' : 'pages'))}
                            title="모의고사 등 페이지가 아닌 학습은 직접 입력으로 전환"
                            className="text-on-surface-variant"
                          >
                            <Icon name="arrow_drop_down" className="!text-[16px]" />
                          </button>
                        </div>
                        {rangeMode === 'pages' ? (
                          <div className="grid grid-cols-2 gap-2">
                            <TextField label="시작 페이지" type="number" value={startPage} onChange={setStartPage} placeholder="10" />
                            <TextField label="끝 페이지" type="number" value={endPage} onChange={setEndPage} placeholder="50" />
                          </div>
                        ) : (
                          <TextField value={customLabel} onChange={setCustomLabel} placeholder="예: 1회 모의고사 풀이 및 채점" />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">공부할 날짜 선택</label>
                        <CompactMonthPicker
                          viewMonthKey={viewMonthKey}
                          onViewMonthChange={setViewMonthKey}
                          selectedDates={selectedDates}
                          onToggleDate={toggleDate}
                          tutoringDays={tutoringDays}
                          lockedDates={editingRangeId ? lockedDates : undefined}
                          minDate={editingRangeId ? undefined : today}
                        />
                      </div>
                      <Button className="w-full" onClick={submitRange}>
                        {editingRangeId ? '수정 내용 저장' : `${selectedDates.length}일에 나눠서 등록`}
                      </Button>
                    </div>
                  )}

                  {ranges.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-1.5">
                      {ranges.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-2">
                          <p className="text-xs text-on-surface-variant">
                            {r.material} · {r.rangeLabel} · {r.assignedDates.join(', ')}
                          </p>
                          <button
                            onClick={() => startEditRange(r.id, subject.id)}
                            className="text-[11px] font-semibold text-primary shrink-0"
                          >
                            {editingRangeId === r.id && rangeSubjectId === subject.id ? '취소' : '수정'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
