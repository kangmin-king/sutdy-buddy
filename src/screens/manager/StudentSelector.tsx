import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { Icon } from '../../primitives';

export default function StudentSelector({
  selectedStudentId,
  onSelectStudent,
  onBackToList,
}: {
  selectedStudentId: string | null;
  onSelectStudent: (studentId: string) => void;
  /** 학생 명단으로 되돌아간다. 예전에는 학생을 한 번 고르면 명단으로 갈 길이 아예 없어서,
   *  전체 현황 비교도 초대코드로 학생 추가도 앱을 껐다 켜야만 가능했다. */
  onBackToList?: () => void;
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
    <div className="flex items-center gap-2 overflow-x-auto px-5 pt-3 pb-2">
      {onBackToList && (
        <button
          type="button"
          onClick={onBackToList}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-surface-container pl-2 pr-3.5 text-xs font-semibold text-on-surface-variant transition active:scale-[0.96]"
        >
          <Icon name="arrow_back" className="!text-[18px]" />
          전체 학생
        </button>
      )}
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
              className="min-h-11 rounded-full bg-surface-container px-3 py-1.5 text-xs font-semibold outline-none ring-2 ring-primary"
            />
          );
        }
        return (
          // 칩과 연필은 형제로 둔다(버튼 안에 버튼이 들어가는 잘못된 중첩 방지).
          // 여백은 컨테이너가 아니라 각 버튼이 갖는다 — 컨테이너에 두면 칩 전체가 눌리는 것처럼
          // 보이는데 실제로는 글자 부분만 반응해서, 보이는 영역과 터치 영역이 어긋난다.
          <div
            key={student.id}
            className={`flex shrink-0 items-center rounded-full text-xs font-semibold whitespace-nowrap transition ${
              isActive ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            <button type="button" onClick={() => onSelectStudent(student.id)} className="min-h-11 pl-4 pr-1.5">
              {labelFor(student.id, index)}
            </button>
            <button
              type="button"
              aria-label={`${labelFor(student.id, index)} 이름 수정`}
              onClick={() => startEdit(student.id, index)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full pr-1 opacity-70 transition active:scale-[0.94]"
            >
              <Icon name="edit" className="!text-[16px]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
