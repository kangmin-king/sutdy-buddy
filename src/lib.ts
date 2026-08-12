import type { ScheduleBlock, PlannerItem, StudyMaterial, DateKey, HomeworkAssignment, StudySession, ExamSubjectRange, ExamSubject, ExamRecord } from './types';
import { QuickTimeChipId } from './constants';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getOverrideDate(): DateKey | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const override = params.get('date');
    if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  } catch {
    // window가 없는 테스트 환경 등 — 무시하고 실제 날짜를 쓴다.
  }
  return null;
}

export function todayKey(): DateKey {
  return getOverrideDate() ?? toDateKey(new Date());
}

export function addDaysToKey(dateKey: DateKey, days: number): DateKey {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateKey(dt);
}

export function daysBetween(fromKey: DateKey, toKeyValue: DateKey): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKeyValue.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

export function shouldGenerateHomeworkItem(assignment: HomeworkAssignment, date: DateKey): boolean {
  return date >= assignment.startDate && date <= assignment.endDate;
}

export function formatDateKorean(dateKey: DateKey): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}년 ${m}월 ${d}일 ${days[dt.getDay()]}요일`;
}

export function addMonthsToKey(dateKey: DateKey, months: number): DateKey {
  const [y, m] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1 + months, 1);
  return toDateKey(dt);
}

export interface MonthDay {
  key: DateKey;
  date: number;
  inCurrentMonth: boolean;
  isSunday: boolean;
}

// dateKey는 보고 싶은 달의 아무 날짜나 넘기면 된다(보통 1일). 항상 월~일 6주(42일) 그리드를 반환해
// 달력 UI가 매달 같은 행 수로 렌더링되게 한다.
export function monthGrid(dateKey: DateKey): MonthDay[] {
  const [y, m] = dateKey.split('-').map(Number);
  const firstOfMonth = new Date(y, m - 1, 1);
  const startDow = (firstOfMonth.getDay() + 6) % 7; // Monday=0
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - startDow);
  const days: MonthDay[] = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);
    days.push({ key: toDateKey(day), date: day.getDate(), inCurrentMonth: day.getMonth() === m - 1, isSunday: day.getDay() === 0 });
  }
  return days;
}

// 2026년 대한민국 법정공휴일(관공서/학교 기준, 근로자의 날 제외 — 학생은 그날도 등교한다).
// 대체공휴일 포함. 해가 바뀌면 이 표를 갱신해야 한다.
const KOREAN_HOLIDAYS_2026: Record<DateKey, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-03': '전국동시지방선거',
  '2026-06-06': '현충일',
  '2026-07-17': '제헌절',
  '2026-08-15': '광복절',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '개천절 대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '크리스마스',
};

export function getHolidayName(dateKey: DateKey): string | null {
  return KOREAN_HOLIDAYS_2026[dateKey] ?? null;
}

export function weekStrip(dateKey: DateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // Monday=0
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - dow);
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  const days: { key: DateKey; label: string; date: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push({ key: toDateKey(day), label: labels[i], date: day.getDate() });
  }
  return days;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function formatMinutes(mins: number): string {
  if (mins <= 0) return '0분';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export interface FreeGap {
  start: string;
  end: string;
  minutes: number;
}

export function computeFreeGaps(blocks: ScheduleBlock[], windowStart = '07:00', windowEnd = '24:00'): FreeGap[] {
  const start = timeToMinutes(windowStart);
  const end = timeToMinutes(windowEnd === '24:00' ? '23:59' : windowEnd) + (windowEnd === '24:00' ? 1 : 0);
  const busy = (blocks || [])
    .map((b) => [timeToMinutes(b.startTime), timeToMinutes(b.endTime)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const range of busy) {
    if (merged.length && range[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], range[1]);
    } else {
      merged.push([...range]);
    }
  }

  const gaps: FreeGap[] = [];
  let cursor = start;
  for (const [s, e] of merged) {
    const gapStart = Math.max(cursor, start);
    const gapEnd = Math.min(s, end);
    if (gapEnd - gapStart >= 10) {
      gaps.push({ start: minutesToTime(gapStart), end: minutesToTime(gapEnd), minutes: gapEnd - gapStart });
    }
    cursor = Math.max(cursor, e);
  }
  if (cursor < end && end - cursor >= 10) {
    gaps.push({ start: minutesToTime(cursor), end: minutesToTime(end === 1440 ? 1439 : end), minutes: end - cursor });
  }
  return gaps;
}

export function sumFreeMinutes(gaps: FreeGap[]): number {
  return gaps.reduce((sum, g) => sum + g.minutes, 0);
}

export function getBestGap(gaps: FreeGap[]): FreeGap | null {
  if (!gaps.length) return null;
  return gaps.reduce((best, g) => (g.minutes > best.minutes ? g : best), gaps[0]);
}

export function getPlannerProgress(items: PlannerItem[]) {
  const total = items.length;
  const completed = items.filter((i) => i.status === 'completed').length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { percent, completed, total };
}

// PlannerItem에는 관리자 컬럼이 없다. 숙제 체인(homeworkAssignmentId → createdBy) 또는 시험 체인
// (examSubjectRangeId → examSubjectId → examId → examRecord.createdBy) 중 있는 쪽을 타고 이 항목을
// 배정한 관리자의 id를 찾는다. 둘 다 없으면(source: 'self') null.
export function resolvePlannerItemManagerId(
  item: PlannerItem,
  slices: {
    homeworkAssignments: HomeworkAssignment[];
    examSubjectRanges: ExamSubjectRange[];
    examSubjects: ExamSubject[];
    examRecords: ExamRecord[];
  }
): string | null {
  if (item.homeworkAssignmentId) {
    const assignment = slices.homeworkAssignments.find((a) => a.id === item.homeworkAssignmentId);
    return assignment?.createdBy ?? null;
  }
  if (item.examSubjectRangeId) {
    const range = slices.examSubjectRanges.find((r) => r.id === item.examSubjectRangeId);
    const subject = range ? slices.examSubjects.find((s) => s.id === range.examSubjectId) : undefined;
    const exam = subject ? slices.examRecords.find((e) => e.id === subject.examId) : undefined;
    return exam?.createdBy ?? null;
  }
  return null;
}

// managerId가 labels(학생이 직접 붙인 별칭)에 있으면 그대로, 없으면 "선생님 N"으로 폴백한다
// (StudentSelector의 "학생 N" 폴백 패턴과 동일).
export function managerDisplayLabel(managerId: string | null, labels: Record<string, string>, index: number): string {
  if (!managerId) return '';
  return labels[managerId] ?? `선생님 ${index + 1}`;
}

export function withEul(word: string): string {
  if (!word) return word;
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return word + '을';
  const hasBatchim = (last - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? '을' : '를');
}

// DB 기본 키 컬럼이 모두 `uuid` 타입이므로 반드시 유효한 UUID를 반환해야 한다
// (낙관적 로컬 업데이트에 쓰는 id가 그대로 insert 문의 id 컬럼 값이 된다).
export function uid(): string {
  return crypto.randomUUID();
}

const QUICK_TIME_FALLBACK: Record<QuickTimeChipId, string> = {
  now: '', // "now"는 항상 nowTime 인자를 그대로 쓴다 (fallback 미사용)
  after_school: '17:00',
  after_dinner: '19:30',
  before_sleep: '22:00',
};

// 빠른 선택 칩을 구체적인 "HH:MM"으로 변환한다.
// "학교·학원 끝나고"는 오늘 일정 중 type이 school/academy인 블록의 가장 늦은 종료 시각 + 10분,
// 해당하는 일정이 없으면 상수 기본값을 쓴다.
export function resolveQuickTimeChip(chipId: QuickTimeChipId, blocks: ScheduleBlock[], nowTime: string): string {
  if (chipId === 'now') return nowTime;
  if (chipId === 'after_school') {
    const matching = blocks.filter((b) => b.type === 'school' || b.type === 'academy');
    if (matching.length === 0) return QUICK_TIME_FALLBACK.after_school;
    const latestEnd = matching.reduce((max, b) => Math.max(max, timeToMinutes(b.endTime)), 0);
    return minutesToTime(latestEnd + 10);
  }
  return QUICK_TIME_FALLBACK[chipId];
}

export interface TimelineBlock {
  startTime: string;
  endTime: string;
  subjectLabel: string;
  deviated: boolean;
}

// 세션 시각은 timestamptz(ISO/UTC)로 저장되지만, 타임라인은 사용자가 실제로 겪은 시각을
// 보여줘야 한다(todayKey()·날짜 선택기도 전부 로컬 기준). 문자열을 그대로 잘라 쓰면 KST에서
// 9시간 어긋나므로 로컬 시각으로 변환한 뒤 시/분을 뽑는다.
function toHHMM(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 관리자 홈의 과목별 학습 타임라인 차트가 세션을 자정 기준 분 단위 위치로 배치할 때 쓴다.
// toHHMM과 같은 이유로 로컬 시각 기준이어야 한다.
export function toMinutesOfDay(isoString: string): number {
  const d = new Date(isoString);
  return d.getHours() * 60 + d.getMinutes();
}

export function sessionsToTimelineBlocks(
  entries: { session: StudySession; subjectLabel: string }[],
  nowIso: string = new Date().toISOString()
): TimelineBlock[] {
  return entries
    .map(({ session, subjectLabel }) => ({
      startTime: toHHMM(session.startedAt),
      endTime: toHHMM(session.endedAt ?? nowIso),
      subjectLabel,
      deviated: session.deviated,
    }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// 선택된 날짜(오름차순 정렬) 수만큼 [startPage, endPage] 총 페이지를 균등 분배한다.
// 나머지는 마지막 날짜에 몰아준다. 진도관리 탭에서 교재+범위 등록 시, 관리자가 미니 캘린더에서
// 탭으로 고른 날짜들에 이 결과를 그대로 sb_planner_items로 즉시 일괄 생성한다(지연 생성 없음).
export function splitPagesAcrossDates(startPage: number, endPage: number, selectedDates: DateKey[]): { date: DateKey; pageRange: string }[] {
  if (selectedDates.length === 0) return [];
  const sorted = [...selectedDates].sort();
  const totalPages = endPage - startPage + 1;
  const base = Math.floor(totalPages / sorted.length);
  const remainder = totalPages - base * sorted.length;

  const result: { date: DateKey; pageRange: string }[] = [];
  let cursor = startPage;
  sorted.forEach((date, idx) => {
    const isLast = idx === sorted.length - 1;
    const count = base + (isLast ? remainder : 0);
    const rangeStart = cursor;
    const rangeEnd = cursor + count - 1;
    result.push({ date, pageRange: `${rangeStart}~${rangeEnd}페이지` });
    cursor = rangeEnd + 1;
  });
  return result;
}

export interface MissedHomeworkUpdate {
  id: string;
  pageRange: string;
}

// 놓친 날(과거 날짜인데 완료 안 된) 페이지 범위 숙제가 있으면, 완료된 항목들 중 가장 뒤 페이지를
// "실제 도달 지점"으로 보고 남은 분량을 아직 완료 안 된 오늘/미래 날짜에 다시 나눠 담는다.
// 자유입력(페이지 형식이 아닌) 범위는 대상이 아니다. 놓친 날 항목 자체는 절대 건드리지 않는다 —
// 캘린더에 남을 미완료 기록이자 "어제 못한 숙제" 배너의 원본이다. 계산 결과가 이미 저장된 값과
// 같으면 그 항목은 결과에서 빠진다(멱등성 — 매 로드마다 돌아도 안전).
export function computeMissedHomeworkRedistribution(
  items: PlannerItem[],
  ranges: ExamSubjectRange[],
  today: DateKey
): MissedHomeworkUpdate[] {
  const updates: MissedHomeworkUpdate[] = [];

  for (const range of ranges) {
    const totalMatch = range.rangeLabel.match(/^(\d+)~(\d+)페이지$/);
    if (!totalMatch) continue;
    const totalStart = Number(totalMatch[1]);
    const totalEnd = Number(totalMatch[2]);

    const rangeItems = items.filter((i) => i.examSubjectRangeId === range.id);
    if (rangeItems.length === 0) continue;

    const hasMissedPastDay = rangeItems.some((i) => i.date < today && i.status !== 'completed');
    if (!hasMissedPastDay) continue;

    let progressPoint = totalStart - 1;
    for (const item of rangeItems) {
      if (item.status !== 'completed') continue;
      const nums = item.pageRange.match(/\d+/g);
      if (!nums || nums.length === 0) continue;
      const end = Number(nums[nums.length - 1]);
      if (end > progressPoint) progressPoint = end;
    }
    if (progressPoint >= totalEnd) continue;

    const futureItems = rangeItems.filter((i) => i.date >= today && i.status !== 'completed');
    if (futureItems.length === 0) continue;

    const futureDates = Array.from(new Set(futureItems.map((i) => i.date))).sort();
    const distribution = splitPagesAcrossDates(progressPoint + 1, totalEnd, futureDates);

    for (const { date, pageRange } of distribution) {
      for (const item of futureItems.filter((i) => i.date === date)) {
        if (item.pageRange !== pageRange) updates.push({ id: item.id, pageRange });
      }
    }
  }

  return updates;
}

export interface TutoringScheduleExceptionInput {
  originalDate: DateKey;
  newDate: DateKey | null;
}

// 요일 패턴(0=일..6=토)으로 기간 안의 과외 날짜를 계산한 뒤 예외를 적용한다.
// 취소(newDate: null)는 그 날짜를 빼고, 변경(newDate가 있음)은 원래 날짜를 빼고 새 날짜를 추가한다.
// 관리자 캘린더 탭에서 매번 계산해서 보여주며, DB에 미래 날짜 행을 미리 만들지 않는다.
export function getTutoringDaysInRange(
  weekdays: number[],
  exceptions: TutoringScheduleExceptionInput[],
  startDate: DateKey,
  endDate: DateKey
): DateKey[] {
  const weekdaySet = new Set(weekdays);
  const dates = new Set<DateKey>();

  if (weekdaySet.size > 0) {
    let cursor = startDate;
    while (cursor <= endDate) {
      const [y, m, d] = cursor.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      if (weekdaySet.has(dow)) dates.add(cursor);
      cursor = addDaysToKey(cursor, 1);
    }
  }

  for (const exception of exceptions) {
    dates.delete(exception.originalDate);
    if (exception.newDate && exception.newDate >= startDate && exception.newDate <= endDate) {
      dates.add(exception.newDate);
    }
  }

  return Array.from(dates).sort();
}

export interface MaterialPace {
  remainingDays: number;
  remainingSessions: number;
  remainingScope: number;
  scopePerSession: number;
  isOverdue: boolean;
}

// 남은 세션 수(며칠에 한 번 × 남은 일수) 기준으로 세션당 분량을 역산한다.
// 목표일이 지났으면(remainingDays < 0) 나눗셈 없이 isOverdue만 표시한다.
export function computeMaterialPace(material: StudyMaterial, todayDateKey: DateKey): MaterialPace {
  const remainingDays = daysBetween(todayDateKey, material.targetDate);
  const remainingScope = Math.max(0, material.totalScope * material.targetPasses - material.currentProgress);

  if (remainingDays < 0) {
    return { remainingDays, remainingSessions: 0, remainingScope, scopePerSession: 0, isOverdue: true };
  }

  const remainingSessions = Math.max(1, Math.floor(remainingDays / material.sessionIntervalDays));
  const scopePerSession = remainingScope === 0 ? 0 : Math.ceil(remainingScope / remainingSessions);
  return { remainingDays, remainingSessions, remainingScope, scopePerSession, isOverdue: false };
}
