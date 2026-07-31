import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey } from '../lib';
import { DIFFICULTY_CHIPS, getSubject } from '../constants';
import { BackBar, Card, StarRating, ChipGroup, TextArea, TextField, Button, Collapsible } from '../primitives';
import type { PlannerItem } from '../types';

export default function StudyLogScreen({ plannerItem, onBack }: { plannerItem: PlannerItem; onBack: () => void }) {
  const { actions } = useAppState();
  const date = todayKey();

  const [rating, setRating] = React.useState(3);
  const [blockedTags, setBlockedTags] = React.useState<string[]>([]);
  const [detailNote, setDetailNote] = React.useState('');
  const [selfMessage, setSelfMessage] = React.useState('');

  const handleSubmit = () => {
    actions.addStudyLog(date, {
      date,
      plannerItemId: plannerItem.id,
      subjectId: plannerItem.subjectId,
      rating,
      blockedTags,
      detailNote,
      selfMessage,
    });
    onBack();
  };

  return (
    <div className="pb-10">
      <BackBar title={`학습 기록 · ${getSubject(plannerItem.subjectId).label}`} onBack={onBack} />
      <div className="px-5 pt-2 space-y-4">
        <Card className="space-y-4">
          <div>
            <p className="text-sm text-on-surface-variant mb-2">오늘 이해 잘 됐나요?</p>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div>
            <p className="text-sm text-on-surface-variant mb-2">막힌 부분 있었나요? (선택)</p>
            <ChipGroup options={DIFFICULTY_CHIPS.map((d) => ({ id: d, label: d }))} value={blockedTags} onChange={setBlockedTags} multi />
          </div>

          <Button className="w-full" onClick={handleSubmit}>
            저장하고 다음
          </Button>

          <Collapsible label="자세히 적기">
            <TextField label="어디가 막혔는지 (선택)" value={detailNote} onChange={setDetailNote} placeholder="예: 쎈 수학 87번, 이차함수 최댓값" />
            <TextArea label="오늘의 한 줄 메모 (선택)" value={selfMessage} onChange={setSelfMessage} rows={2} placeholder="예: 오늘은 집중이 잘 안 됐지만 끝까지 했다" />
          </Collapsible>
        </Card>
      </div>
    </div>
  );
}
