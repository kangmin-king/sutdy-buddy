import React from 'react';
import { Icon } from '../../primitives';

const STORAGE_KEY = 'distractionFabPosition';
const BUTTON_SIZE = 48; // w-12
const MIN_VISIBLE = 24; // 화면 밖으로 끌고 가도 이만큼은 남아있어서 다시 잡을 수 있게

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
  } catch {
    // 저장된 값이 깨져 있으면 무시하고 기본 위치를 쓴다.
  }
  return null;
}

// 딴짓멈춰 버튼. 기본 위치는 오른쪽으로 살짝 걸쳐서(일부 잘려도 됨) 두고, 꾹 눌러서 끌면
// 원하는 자리로 옮길 수 있다 — 옮긴 위치는 localStorage에 저장돼 다음에 앱을 열어도 유지된다.
// 누른 채로 움직이지 않고 떼면(=탭) onOpen을 호출하고, 움직였으면 드래그로 취급해 위치만 바꾼다.
export default function DistractionFab({ onOpen }: { onOpen: () => void }) {
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(null);
  const dragRef = React.useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

  const defaultPosition = React.useCallback(() => {
    const bottomBarClearance = 136; // 하단 네비(약 5.5rem) + 버튼 높이만큼 위
    return {
      x: window.innerWidth - BUTTON_SIZE + 16,
      y: window.innerHeight - bottomBarClearance,
    };
  }, []);

  React.useEffect(() => {
    setPosition(loadPosition() ?? defaultPosition());
  }, [defaultPosition]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!position) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y, moved: false };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    setPosition({
      x: clamp(drag.originX + dx, MIN_VISIBLE - BUTTON_SIZE, window.innerWidth - MIN_VISIBLE),
      y: clamp(drag.originY + dy, MIN_VISIBLE - BUTTON_SIZE, window.innerHeight - MIN_VISIBLE),
    });
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      setPosition((p) => {
        if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
        return p;
      });
    } else {
      onOpen();
    }
  };

  if (!position) return null;

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="fixed z-30 flex flex-col items-center gap-1 touch-none"
      style={{ left: position.x, top: position.y }}
    >
      <span className="w-12 h-12 rounded-full bg-on-surface text-surface flex items-center justify-center shadow-card">
        <Icon name="phonelink_lock" className="!text-[22px]" />
      </span>
      <span className="text-[10px] font-semibold text-on-surface-variant bg-surface-container-lowest px-1.5 py-0.5 rounded-full shadow-card">
        딴짓멈춰
      </span>
    </button>
  );
}
