import React from 'react';
import type { SchoolTimetableSlot } from '../../types';

const WEEKDAYS = [
  { weekday: 1, label: '월' },
  { weekday: 2, label: '화' },
  { weekday: 3, label: '수' },
  { weekday: 4, label: '목' },
  { weekday: 5, label: '금' },
];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

// 학생 본인 캘린더(편집 가능)와 선생님 캘린더(읽기 전용) 양쪽에서 같은 그리드를 쓴다.
// editable일 때만 칸을 눌러 과목을 입력/수정/삭제할 수 있다.
export default function SchoolTimetableGrid({
  slots,
  editable = false,
  onEditCell,
}: {
  slots: SchoolTimetableSlot[];
  editable?: boolean;
  onEditCell?: (weekday: number, period: number, currentSubject: string) => void;
}) {
  const bySlot = new Map(slots.map((s) => [`${s.weekday}-${s.period}`, s.subject]));

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full border-collapse text-center min-w-[320px]">
        <thead>
          <tr>
            <th className="w-8 text-[10px] text-on-surface-variant font-normal pb-1"></th>
            {WEEKDAYS.map((w) => (
              <th key={w.weekday} className="text-[11px] font-semibold text-on-surface-variant pb-1">
                {w.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((period) => (
            <tr key={period}>
              <td className="text-[10px] text-on-surface-variant py-0.5 pr-1">{period}교시</td>
              {WEEKDAYS.map((w) => {
                const subject = bySlot.get(`${w.weekday}-${period}`) ?? '';
                return (
                  <td key={w.weekday} className="p-0.5">
                    {editable ? (
                      <button
                        onClick={() => onEditCell?.(w.weekday, period, subject)}
                        className={`w-full min-h-[2.25rem] rounded-lg text-[11px] leading-tight px-1 py-1.5 ${
                          subject ? 'bg-primary-container/50 text-on-surface font-semibold' : 'bg-surface-container text-outline-variant'
                        }`}
                      >
                        {subject || '+'}
                      </button>
                    ) : (
                      <div
                        className={`w-full min-h-[2.25rem] rounded-lg text-[11px] leading-tight px-1 py-1.5 flex items-center justify-center ${
                          subject ? 'bg-primary-container/50 text-on-surface font-semibold' : 'text-outline-variant'
                        }`}
                      >
                        {subject || '-'}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
