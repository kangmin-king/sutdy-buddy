import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { TopAppBar, Card, Button, TextField } from '../../primitives';

export default function ManagerStudentListScreen({ onSelectStudent }: { onSelectStudent: (studentId: string) => void }) {
  const { state, actions } = useAppState();
  const [code, setCode] = React.useState('');

  return (
    <div className="px-5 pt-4 pb-10">
      <TopAppBar />
      <h1 className="text-xl font-bold mt-2 mb-4">내 학생</h1>

      <Card className="mb-4 space-y-2">
        <TextField label="학생 초대코드" value={code} onChange={setCode} placeholder="예: A1B2C3D4" />
        <Button
          className="w-full"
          onClick={() => {
            actions.linkByInviteCode(code);
            setCode('');
          }}
        >
          학생 연결하기
        </Button>
      </Card>

      <div className="space-y-2">
        {state.managedStudents.length === 0 && (
          <p className="text-sm text-on-surface-variant text-center py-10">아직 연결된 학생이 없어요.</p>
        )}
        {state.managedStudents.map((s, index) => (
          <button key={s.id} onClick={() => onSelectStudent(s.id)} className="w-full text-left">
            <Card className="flex items-center justify-between">
              <p className="text-sm font-bold">{state.studentLabels[s.id] ?? `학생 ${index + 1}`}</p>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
