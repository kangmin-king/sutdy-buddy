import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { Icon } from '../../primitives';

export default function StudentSelector({
  selectedStudentId,
  onSelectStudent,
}: {
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string) => void;
}) {
  const { state, actions } = useAppState();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  const labelFor = (studentId: string, index: number) => state.studentLabels[studentId] ?? `학생 ${index + 1}`;

  const startEdit = (studentId: string, index: number) => {
    setEditingId(studentId);
    setDraft(labelFor(studentId, index));
  };

  const commitEdit = () => {
    if (editingId && draft.trim()) actions.updateStudentLabel(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className="flex gap-2 overflow-x-auto px-5 pt-3 pb-2">
      {state.managedStudents.map((student, index) => {
        const isActive = student.id === selectedStudentId;
        const isEditing = editingId === student.id;
        if (isEditing) {
          return (
            <input
              key={student.id}
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
          // 칩과 연필은 형제로 둔다(버튼 안에 버튼이 들어가는 잘못된 중첩 방지).
          // 겉모양은 컨테이너가 유지하고, 선택/수정은 각자 자기 클릭 핸들러만 갖는다.
          <div
            key={student.id}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
              isActive ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            <button type="button" onClick={() => onSelectStudent(student.id)}>
              {labelFor(student.id, index)}
            </button>
            <button
              type="button"
              aria-label={`${labelFor(student.id, index)} 이름 수정`}
              onClick={() => startEdit(student.id, index)}
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
