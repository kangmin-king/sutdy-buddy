import type { ScheduleBlock, PlannerItem, StudyMaterial, DateKey, HomeworkAssignment, StudySession } from './types';
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
    days.push({ key: toDateKey(day), date: day.getDate(), inCurrentMonth: day.getMonth() === m - 1 });
  }
  return days;
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
