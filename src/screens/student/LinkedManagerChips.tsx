import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { managerDisplayLabel } from '../../lib';
import { Icon } from '../../primitives';

// 학생이 연결된 선생님/학부모(관리자)를 자기 화면에서만 구분해서 부르는 이름표 목록.
// src/screens/manager/StudentSelector.tsx의 칩+연필 패턴을 미러링하되, 여기선 "선택" 개념이
// 없다(학생은 화면을 전환하지 않는다) — 이름 표시와 수정 전용.
export default function LinkedManagerChips() {
  const { state, actions } = useAppState();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  const startEdit = (managerId: string, index: number) => {
    setEditingId(managerId);
    setDraft(managerDisplayLabel(managerId, state.managerLabels, index));
  };

  const commitEdit = () => {
    if (editingId && draft.trim()) actions.updateManagerLabel(editingId, draft.trim());
    setEditingId(null);
  };

  if (state.linkedManagers.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pt-2 pb-1">
      {state.linkedManagers.map((manager, index) => {
        const isEditing = editingId === manager.id;
        if (isEditing) {
          return (
            <input
              key={manager.id}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
              className="rounded-full bg-surface-container px-3 py-1.5 text-xs font-semibold outline-none ring-2 ring-primary"
            />
          );
        }
        return (
          <div
            key={manager.id}
            className="flex items-center gap-1 rounded-full bg-surface-container px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-on-surface-variant"
          >
            <span>{managerDisplayLabel(manager.id, state.managerLabels, index)}</span>
            <button
              type="button"
              aria-label={`${managerDisplayLabel(manager.id, state.managerLabels, index)} 이름 수정`}
              onClick={() => startEdit(manager.id, index)}
              className="ml-0.5 flex items-center opacity-70"
            >
              <Icon name="edit" className="!text-[14px]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
