import React from 'react';
import { getSubject } from '../../constants';
import { Card, Icon, TextField } from '../../primitives';
import type { PlannerItem } from '../../types';

// 홈 탭/캘린더 탭에서 공통으로 쓰는 항목 카드. 숙제(source: 'homework')는 "오늘 얼마나 해야 하는지"
// (pageRange)를 교재명과 분리해서 보여주고, 연필로 그 자리에서 바로 수정할 수 있다. 학생이 스스로
// 짠 할 일(source: 'self')은 읽기 전용으로만 보여준다(관리자가 대신 계획을 바꿀 이유가 없다).
export default function PlannerItemRow({
  item,
  onSaveAmount,
  onDelete,
}: {
  item: PlannerItem;
  onSaveAmount?: (value: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.pageRange);

  const startEdit = () => {
    setDraft(item.pageRange);
    setEditing(true);
  };

  const commit = () => {
    if (onSaveAmount && draft.trim() && draft.trim() !== item.pageRange) onSaveAmount(draft.trim());
    setEditing(false);
  };

  return (
    <Card className="flex items-center justify-between mb-2 gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">
          {getSubject(item.subjectId).label}
          {item.source === 'homework' && item.material && (
            <span className="text-xs font-normal text-on-surface-variant ml-1.5">{item.material}</span>
          )}
        </p>
        {item.source === 'homework' ? (
          editing ? (
            <div className="mt-1">
              <div className="flex items-center gap-1">
                <TextField value={draft} onChange={setDraft} placeholder="오늘 분량/내용" />
                <button onClick={commit} className="text-xs font-semibold text-primary shrink-0">
                  저장
                </button>
              </div>
              <p className="text-[10px] text-on-surface-variant mt-1">
                페이지 범위 숙제는 마지막 숫자(예: "1~4페이지"의 4)까지 한 걸로 보고, 남은 날짜에 나머지를 자동으로 다시 나눠요.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <p className="text-xs font-semibold text-primary">{item.pageRange || '오늘 분량 미지정'}</p>
              {onSaveAmount && (
                <button onClick={startEdit} className="text-on-surface-variant shrink-0">
                  <Icon name="edit" className="!text-[13px]" />
                </button>
              )}
            </div>
          )
        ) : (
          <p className="text-xs text-on-surface-variant">{item.material || '할 일'}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div
          className={`w-7 h-7 rounded-md border-2 flex items-center justify-center ${
            item.status === 'completed' ? 'bg-primary border-primary' : 'border-outline-variant'
          }`}
        >
          {item.status === 'completed' && <Icon name="check" className="!text-[18px] text-on-primary" />}
        </div>
        {onDelete && item.source === 'homework' && (
          <button onClick={onDelete} className="text-on-surface-variant">
            <Icon name="close" className="!text-[16px]" />
          </button>
        )}
      </div>
    </Card>
  );
}
