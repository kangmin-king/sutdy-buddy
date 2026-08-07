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
      {/* percent가 있을 때만 안쪽에 불투명 배경을 깔아, 날짜 숫자가 conic-gradient 채움 위에 바로 얹혀
          대비가 떨어지는 일 없이 항상 중립 배경 위에서 렌더되게 한다(도큐 코멘트의 "얇은 링"과 일치). */}
      <span
        className={percent == null ? 'flex items-center justify-center rounded-full' : 'flex items-center justify-center rounded-full bg-surface'}
        style={percent == null ? undefined : { width: size - 4, height: size - 4 }}
      >
        {children}
      </span>
    </span>
  );
}
