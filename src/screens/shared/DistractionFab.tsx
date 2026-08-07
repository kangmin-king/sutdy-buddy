import React from 'react';
import { Icon } from '../../primitives';

const STORAGE_KEY = 'distractionFabY';
const SIZE = 56; // 원 지름
const HIDDEN_FRACTION = 1 / 3; // 오른쪽으로 이 비율만큼 화면 밖에 걸쳐서 반원처럼 보이게

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadY(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// 딴짓멈춰 버튼. 오른쪽 화면 밖으로 1/3(원의 오른쪽)이 걸쳐 나가서 나머지 2/3만 보이는 형태로
// 오른쪽 가장자리에 고정한다 — 자물쇠 이모지도 그 보이는 부분 가운데로 맞춘다. 가로 위치는
// 고정이고, 꾹 눌러서 위아래로만 옮길 수 있다(세로 위치는 localStorage에 저장돼 유지).
export default function DistractionFab({ onOpen }: { onOpen: () => void }) {
  const [y, setY] = React.useState<number | null>(null);
  const dragRef = React.useRef<{ startY: number; originY: number; moved: boolean } | null>(null);

  const defaultY = React.useCallback(() => {
    const bottomBarClearance = 136;
    return window.innerHeight - bottomBarClearance;
  }, []);

  React.useEffect(() => {
    setY(loadY() ?? defaultY());
  }, [defaultY]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (y === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, originY: y, moved: false };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    setY(clamp(drag.originY + dy, SIZE / 2, window.innerHeight - SIZE / 2));
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      setY((current) => {
        if (current != null) localStorage.setItem(STORAGE_KEY, String(current));
        return current;
      });
    } else {
      onOpen();
    }
  };

  if (y === null) return null;

  const visibleWidth = SIZE * (1 - HIDDEN_FRACTION);

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="fixed z-30 rounded-full bg-on-surface text-surface shadow-card touch-none"
      style={{ width: SIZE, height: SIZE, right: -SIZE * HIDDEN_FRACTION, top: y - SIZE / 2 }}
    >
      <span className="absolute flex items-center justify-center" style={{ left: visibleWidth / 2, top: '50%', transform: 'translate(-50%, -50%)' }}>
        <Icon name="lock" filled className="!text-[22px]" />
      </span>
    </button>
  );
}
