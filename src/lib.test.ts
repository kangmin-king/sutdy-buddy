import { describe, it, expect } from 'vitest';
import {
  timeToMinutes,
  minutesToTime,
  formatMinutes,
  getPlannerProgress,
  addDaysToKey,
  addMonthsToKey,
  monthGrid,
  uid,
  shouldGenerateHomeworkItem,
  splitPagesAcrossDates,
  getTutoringDaysInRange,
  getHolidayName,
  toMinutesOfDay,
  computeMissedHomeworkRedistribution,
  resolvePlannerItemManagerId,
  managerDisplayLabel,
  dayKeyOf,
  dayStartOf,
  DAY_ROLLOVER_HOUR,
} from './lib';
import type { PlannerItem, HomeworkAssignment, ExamSubjectRange, ExamSubject, ExamRecord } from './types';

describe('dayKeyOf — 하루는 자정이 아니라 새벽 4시에 넘어간다', () => {
  // 학생이 타이머를 켜고 공부하다 12시를 넘기면 그때까지 한 공부가 다 사라지던 문제.
  // 공부 시간은 그날 항목에 붙는데 자정에 "오늘"이 바뀌면 화면이 빈 새 목록으로 갈아끼워졌다.
  it('밤 12시를 넘겨도 자기 전까지는 같은 날이다', () => {
    expect(dayKeyOf(new Date(2026, 8, 9, 23, 59))).toBe('2026-09-09');
    expect(dayKeyOf(new Date(2026, 8, 10, 0, 0))).toBe('2026-09-09');
    expect(dayKeyOf(new Date(2026, 8, 10, 2, 30))).toBe('2026-09-09');
    expect(dayKeyOf(new Date(2026, 8, 10, 3, 59, 59))).toBe('2026-09-09');
  });

  it('새벽 4시가 되면 다음 날로 넘어간다', () => {
    expect(dayKeyOf(new Date(2026, 8, 10, 4, 0))).toBe('2026-09-10');
    expect(dayKeyOf(new Date(2026, 8, 10, 9, 0))).toBe('2026-09-10');
  });

  it('월이 바뀌는 경계에서도 전날을 제대로 짚는다', () => {
    expect(dayKeyOf(new Date(2026, 9, 1, 1, 0))).toBe('2026-09-30');
    expect(dayKeyOf(new Date(2026, 0, 1, 1, 0))).toBe('2025-12-31');
  });

  it('dayStartOf는 그 하루가 시작한 실제 시각을 준다', () => {
    // 허용앱 사용시간처럼 타임스탬프로 걸러야 하는 곳이 같은 경계를 쓰게 하기 위한 것.
    const start = dayStartOf(new Date(2026, 8, 10, 1, 30));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(8);
    expect(start.getDate()).toBe(9);
    expect(start.getHours()).toBe(DAY_ROLLOVER_HOUR);
    expect(start.getMinutes()).toBe(0);
    // 새벽 1시 30분에 조회하면 어제 새벽 4시부터가 "오늘"이다 — 21시간 30분 전.
    expect(new Date(2026, 8, 10, 1, 30).getTime() - start.getTime()).toBe((21 * 60 + 30) * 60 * 1000);
  });

  it('dayKeyOf와 dayStartOf가 같은 하루를 가리킨다', () => {
    for (const hour of [0, 3, 4, 12, 23]) {
      const instant = new Date(2026, 8, 10, hour, 15);
      expect(dayKeyOf(dayStartOf(instant))).toBe(dayKeyOf(instant));
    }
  });
});

describe('timeToMinutes / minutesToTime', () => {
  it('converts HH:MM to minutes and back', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(minutesToTime(570)).toBe('09:30');
  });
});

describe('formatMinutes', () => {
  it('formats minutes into 시간/분 Korean text', () => {
    expect(formatMinutes(0)).toBe('0분');
    expect(formatMinutes(45)).toBe('45분');
    expect(formatMinutes(60)).toBe('1시간');
    expect(formatMinutes(125)).toBe('2시간 5분');
  });
});

function plannerItem(overrides: Partial<PlannerItem>): PlannerItem {
  return {
    id: 'p1',
    date: '2026-07-30',
    order: 1,
    subjectId: 'math',
    startTime: '19:00',
    studyType: null,
    material: '',
    unit: '',
    pageRange: '',
    endTime: null,
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
    ...overrides,
  };
}

describe('getPlannerProgress', () => {
  it('returns 0 percent for an empty list', () => {
    expect(getPlannerProgress([])).toEqual({ percent: 0, completed: 0, total: 0 });
  });
  it('computes percent completed', () => {
    const items = [plannerItem({ id: 'a', status: 'completed' }), plannerItem({ id: 'b', status: 'planned' })];
    expect(getPlannerProgress(items)).toEqual({ percent: 50, completed: 1, total: 2 });
  });
});

function examSubject(overrides: Partial<ExamSubject>): ExamSubject {
  return {
    id: 'es1', examId: 'e1', subjectId: 'math', targetGrade: '1', targetScore: '100', targetRank: '1',
    createdAt: '2026-08-01T00:00:00Z', ...overrides,
  };
}

function examRecord(overrides: Partial<ExamRecord>): ExamRecord {
  return {
    id: 'e1', studentId: 's1', createdBy: 'm2', title: '중간고사', examDate: '2026-09-01', isMain: true,
    createdAt: '2026-08-01T00:00:00Z', ...overrides,
  };
}

describe('resolvePlannerItemManagerId', () => {
  it('resolves via the homework assignment chain', () => {
    const item = plannerItem({ source: 'homework', homeworkAssignmentId: 'h1' });
    const slices = { homeworkAssignments: [homework({ id: 'h1', createdBy: 'm1' })], examSubjectRanges: [], examSubjects: [], examRecords: [] };
    expect(resolvePlannerItemManagerId(item, slices)).toBe('m1');
  });

  it('resolves via the exam subject range chain', () => {
    const item = plannerItem({ source: 'homework', examSubjectRangeId: 'r1' });
    const slices = {
      homeworkAssignments: [],
      examSubjectRanges: [examSubjectRange({ id: 'r1', examSubjectId: 'es1' })],
      examSubjects: [examSubject({ id: 'es1', examId: 'e1' })],
      examRecords: [examRecord({ id: 'e1', createdBy: 'm2' })],
    };
    expect(resolvePlannerItemManagerId(item, slices)).toBe('m2');
  });

  it('returns null for a self-added item with no chain', () => {
    const item = plannerItem({ source: 'self' });
    const slices = { homeworkAssignments: [], examSubjectRanges: [], examSubjects: [], examRecords: [] };
    expect(resolvePlannerItemManagerId(item, slices)).toBeNull();
  });
});

describe('managerDisplayLabel', () => {
  it('returns null-safe empty string when there is no manager', () => {
    expect(managerDisplayLabel(null, {}, 0)).toBe('');
  });
  it('returns the student-chosen label when present', () => {
    expect(managerDisplayLabel('m1', { m1: '수학쌤' }, 0)).toBe('수학쌤');
  });
  it('falls back to 선생님 N when unlabeled', () => {
    expect(managerDisplayLabel('m1', {}, 2)).toBe('선생님 3');
  });
  // 연결이 끊긴 선생님이 만든 숙제를 학생이 보는 경우. findIndex가 -1을 주는데, 예전에는
  // 그게 "선생님 0"으로 화면에 나왔다.
  it('drops the number when the manager is no longer in the list', () => {
    expect(managerDisplayLabel('m1', {}, -1)).toBe('선생님');
  });
  it('still prefers the student-chosen label for an unlinked manager', () => {
    expect(managerDisplayLabel('m1', { m1: '수학쌤' }, -1)).toBe('수학쌤');
  });
});

describe('addDaysToKey', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysToKey('2026-07-30', 3)).toBe('2026-08-02');
  });
});

describe('addMonthsToKey', () => {
  it('shifts to the 1st of a later month', () => {
    expect(addMonthsToKey('2026-08-15', 1)).toBe('2026-09-01');
  });
  it('shifts to the 1st of an earlier month, crossing a year boundary', () => {
    expect(addMonthsToKey('2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('monthGrid', () => {
  it('returns a 42-day grid starting on a Monday and ending on a Sunday', () => {
    const grid = monthGrid('2026-08-01');
    expect(grid).toHaveLength(42);
    const [fy, fm, fd] = grid[0].key.split('-').map(Number);
    expect(new Date(fy, fm - 1, fd).getDay()).toBe(1); // Monday
    const [ly, lm, ld] = grid[41].key.split('-').map(Number);
    expect(new Date(ly, lm - 1, ld).getDay()).toBe(0); // Sunday
  });

  it('marks every day of the requested month as inCurrentMonth, and no others', () => {
    const grid = monthGrid('2026-08-01');
    const augustDays = grid.filter((d) => d.inCurrentMonth);
    expect(augustDays).toHaveLength(31);
    expect(augustDays[0].key).toBe('2026-08-01');
    expect(augustDays[30].key).toBe('2026-08-31');
  });
});

describe('uid', () => {
  it('generates a valid UUID (DB primary key columns are typed uuid)', () => {
    expect(uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});


function homework(overrides: Partial<HomeworkAssignment>): HomeworkAssignment {
  return {
    id: 'h1', studentId: 's1', createdBy: 'm1', subjectId: 'math',
    material: '쎈 수학', amountPerDay: '10p', startDate: '2026-08-01',
    endDate: '2026-08-10', updatedAt: '2026-08-01T00:00:00Z', ...overrides,
  };
}

describe('shouldGenerateHomeworkItem', () => {
  it('is true for a date inside the assignment range', () => {
    expect(shouldGenerateHomeworkItem(homework({}), '2026-08-05')).toBe(true);
  });
  it('is true on the exact start and end dates', () => {
    expect(shouldGenerateHomeworkItem(homework({}), '2026-08-01')).toBe(true);
    expect(shouldGenerateHomeworkItem(homework({}), '2026-08-10')).toBe(true);
  });
  it('is false before the start date', () => {
    expect(shouldGenerateHomeworkItem(homework({}), '2026-07-31')).toBe(false);
  });
  it('is false after the end date', () => {
    expect(shouldGenerateHomeworkItem(homework({}), '2026-08-11')).toBe(false);
  });
});

describe('toMinutesOfDay', () => {
  it('returns local minutes since midnight for a KST-offset timestamp', () => {
    expect(toMinutesOfDay('2026-08-04T14:30:00+09:00')).toBe(14 * 60 + 30);
  });

  it('converts a UTC-stored timestamp to local minutes rather than slicing the ISO string', () => {
    // 05:00Z == 14:00 KST
    expect(toMinutesOfDay('2026-08-04T05:00:00Z')).toBe(14 * 60);
  });

  it('handles midnight', () => {
    expect(toMinutesOfDay('2026-08-04T00:00:00+09:00')).toBe(0);
  });
});

describe('splitPagesAcrossDates', () => {
  it('splits evenly across selected dates, sorted ascending, remainder on the last date', () => {
    const result = splitPagesAcrossDates(1, 40, ['2026-08-09', '2026-08-06', '2026-08-07']);
    expect(result).toEqual([
      { date: '2026-08-06', pageRange: '1~13페이지' },
      { date: '2026-08-07', pageRange: '14~26페이지' },
      { date: '2026-08-09', pageRange: '27~40페이지' },
    ]);
  });

  it('assigns the whole range to a single selected date', () => {
    const result = splitPagesAcrossDates(10, 50, ['2026-08-06']);
    expect(result).toEqual([{ date: '2026-08-06', pageRange: '10~50페이지' }]);
  });

  it('handles a range that divides evenly with no remainder', () => {
    const result = splitPagesAcrossDates(1, 30, ['2026-08-06', '2026-08-07', '2026-08-08']);
    expect(result).toEqual([
      { date: '2026-08-06', pageRange: '1~10페이지' },
      { date: '2026-08-07', pageRange: '11~20페이지' },
      { date: '2026-08-08', pageRange: '21~30페이지' },
    ]);
  });

  it('returns an empty array when no dates are selected', () => {
    expect(splitPagesAcrossDates(1, 40, [])).toEqual([]);
  });

  // 날짜가 페이지보다 많으면 하루 한 페이지 아래로는 쪼갤 수 없다. 예전에는 base가 0이 되어
  // 마지막을 뺀 모든 날짜가 `1~0페이지`라는 뒤집힌 범위를 받았고 그대로 저장됐다.
  it('페이지보다 날짜가 많으면 앞에서부터 페이지 수만큼만 배정한다', () => {
    const result = splitPagesAcrossDates(1, 3, ['2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10']);
    expect(result).toEqual([
      { date: '2026-08-06', pageRange: '1~1페이지' },
      { date: '2026-08-07', pageRange: '2~2페이지' },
      { date: '2026-08-08', pageRange: '3~3페이지' },
    ]);
  });

  it('뒤집힌 범위는 아무것도 배정하지 않는다', () => {
    expect(splitPagesAcrossDates(30, 10, ['2026-08-06', '2026-08-07'])).toEqual([]);
  });

  it('어떤 입력에도 뒤집힌 페이지 범위를 만들지 않는다', () => {
    const dates = ['2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];
    for (let end = 1; end <= 6; end++) {
      for (const result of splitPagesAcrossDates(1, end, dates)) {
        const [from, to] = result.pageRange.replace('페이지', '').split('~').map(Number);
        expect(to).toBeGreaterThanOrEqual(from);
      }
    }
  });
});

function examSubjectRange(overrides: Partial<ExamSubjectRange>): ExamSubjectRange {
  return {
    id: 'r1',
    examSubjectId: 'es1',
    material: '쎈 수학',
    rangeLabel: '1~30페이지',
    assignedDates: ['2026-08-07', '2026-08-08', '2026-08-09'],
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeMissedHomeworkRedistribution', () => {
  it('returns nothing when no past day was missed', () => {
    const range = examSubjectRange({});
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~10페이지', examSubjectRangeId: 'r1', status: 'completed' }),
      plannerItem({ id: 'b', date: '2026-08-08', pageRange: '11~20페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'c', date: '2026-08-09', pageRange: '21~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    expect(computeMissedHomeworkRedistribution(items, [range], '2026-08-08')).toEqual([]);
  });

  it('redistributes the full range when the missed day made zero progress', () => {
    const range = examSubjectRange({});
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~10페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'b', date: '2026-08-08', pageRange: '11~20페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'c', date: '2026-08-09', pageRange: '21~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    const result = computeMissedHomeworkRedistribution(items, [range], '2026-08-08');
    expect(result).toEqual(
      expect.arrayContaining([
        { id: 'b', pageRange: '1~15페이지' },
        { id: 'c', pageRange: '16~30페이지' },
      ])
    );
    expect(result).toHaveLength(2);
  });

  it('only redistributes what is left past the last completed page', () => {
    const range = examSubjectRange({});
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~10페이지', examSubjectRangeId: 'r1', status: 'completed' }),
      plannerItem({ id: 'b', date: '2026-08-08', pageRange: '11~20페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'c', date: '2026-08-09', pageRange: '21~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    const result = computeMissedHomeworkRedistribution(items, [range], '2026-08-09');
    expect(result).toEqual([{ id: 'c', pageRange: '11~30페이지' }]);
  });

  it('is idempotent: computing again after applying the updates returns nothing', () => {
    const range = examSubjectRange({});
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~10페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'b', date: '2026-08-08', pageRange: '1~15페이지', examSubjectRangeId: 'r1', status: 'planned' }),
      plannerItem({ id: 'c', date: '2026-08-09', pageRange: '16~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    expect(computeMissedHomeworkRedistribution(items, [range], '2026-08-08')).toEqual([]);
  });

  it('ignores free-input ranges (not a page-range label)', () => {
    const range = examSubjectRange({ rangeLabel: '1회 모의고사 풀이 및 채점' });
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1회 모의고사 풀이 및 채점', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    expect(computeMissedHomeworkRedistribution(items, [range], '2026-08-08')).toEqual([]);
  });

  it('returns nothing when there are no future dates left to redistribute into', () => {
    const range = examSubjectRange({ assignedDates: ['2026-08-07'] });
    const items = [
      plannerItem({ id: 'a', date: '2026-08-07', pageRange: '1~30페이지', examSubjectRangeId: 'r1', status: 'planned' }),
    ];
    expect(computeMissedHomeworkRedistribution(items, [range], '2026-08-08')).toEqual([]);
  });
});

describe('getTutoringDaysInRange', () => {
  it('returns dates matching the weekday pattern within range (0=일..6=토)', () => {
    // 2026-08-06 is a Thursday (4), 2026-08-07 Friday (5), 2026-08-08 Saturday (6)
    const result = getTutoringDaysInRange([5, 6], [], '2026-08-06', '2026-08-12');
    expect(result).toEqual(['2026-08-07', '2026-08-08']);
  });

  it('removes a date cancelled by an exception with newDate null', () => {
    const result = getTutoringDaysInRange([5, 6], [{ originalDate: '2026-08-07', newDate: null }], '2026-08-06', '2026-08-12');
    expect(result).toEqual(['2026-08-08']);
  });

  it('adds the exception newDate when a session is moved, without duplicating an existing tutoring day', () => {
    // moved from Fri 08-07 to Sun 08-09 (not itself a tutoring weekday)
    const result = getTutoringDaysInRange([5, 6], [{ originalDate: '2026-08-07', newDate: '2026-08-09' }], '2026-08-06', '2026-08-12');
    expect(result).toEqual(['2026-08-08', '2026-08-09']);
  });

  it('does not duplicate when a moved date lands on an already-tutoring weekday', () => {
    // moved from Fri 08-07 to Sat 08-08, which is already a tutoring day
    const result = getTutoringDaysInRange([5, 6], [{ originalDate: '2026-08-07', newDate: '2026-08-08' }], '2026-08-06', '2026-08-12');
    expect(result).toEqual(['2026-08-08']);
  });

  it('returns an empty array when no weekdays are set', () => {
    expect(getTutoringDaysInRange([], [], '2026-08-06', '2026-08-12')).toEqual([]);
  });
});

describe('getHolidayName', () => {
  it('returns the holiday name for a known 2026 public holiday', () => {
    expect(getHolidayName('2026-08-15')).toBe('광복절');
  });

  it('returns each day of a multi-day holiday period', () => {
    expect(getHolidayName('2026-09-24')).toBe('추석 연휴');
    expect(getHolidayName('2026-09-25')).toBe('추석');
  });

  it('returns null for an ordinary weekday', () => {
    expect(getHolidayName('2026-08-06')).toBeNull();
  });
});
