import React from 'react';

// 과거 날짜의 완료율을 얇은 링으로 보여준다 — 12시 방향부터 시계 방향으로 채워진다. 안쪽 children은
// 기존 날짜 원(선택/오늘/과외 요일 배경색 등)을 그대로 감싸기만 해서, 완료율 표시가 추가돼도 기존
// 시각 상태는 전혀 안 바뀐다. percent가 null이면(오늘/미래 날짜, 또는 그날 항목이 없음) 링 없이
// children만 그대로 렌더한다.
export function DayProgressRing({
  percent,
  size = 38,
  children,
}: {
  percent: number | null;
  size?: number;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties =
    percent == null ? {} : { background: `conic-gradient(#366095 0% ${percent}%, #e5e5e5 ${percent}% 100%)` };
  return (
    <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: size, height: size, ...style }}>
      {children}
    </span>
  );
}
