import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { useAuth } from '../state/AuthContext';
import { GRADES, SUBJECTS } from '../constants';
import { Button, ChipGroup, TextField, SelectField } from '../primitives';
import type { Grade, SubjectId, Role } from '../types';

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { actions } = useAppState();
  const { session } = useAuth();
  const role: Role = (session?.user.user_metadata.role as Role | undefined) ?? 'student';
  const userId = session!.user.id;

  const [grade, setGrade] = React.useState<Grade>(GRADES[2]);
  const [mainSubjects, setMainSubjects] = React.useState<SubjectId[]>(['math']);
  const [goal, setGoal] = React.useState('');
  const [examDate, setExamDate] = React.useState('');
  const [workbooks, setWorkbooks] = React.useState('');
  const [inviteCodeInput, setInviteCodeInput] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const handleStudentSubmit = async () => {
    setSubmitting(true);
    await actions.saveProfile({
      id: userId,
      grade,
      mainSubjects,
      goal,
      examDate: examDate || null,
      workbooks,
      onboardedAt: new Date().toISOString(),
      role: 'student',
      inviteCode: crypto.randomUUID().slice(0, 8).toUpperCase(),
      subjectColors: {},
    });
    setSubmitting(false);
    onComplete();
  };

  const handleManagerSubmit = async () => {
    setSubmitting(true);
    await actions.saveProfile({
      id: userId,
      // 관리자(과외쌤·학부모)는 학생 전용 필드를 쓰지 않으므로 null로 남긴다.
      grade: null,
      mainSubjects: null,
      goal: null,
      examDate: null,
      workbooks: null,
      onboardedAt: new Date().toISOString(),
      role: 'manager',
      inviteCode: null,
      subjectColors: {},
    });
    const code = inviteCodeInput.trim();
    if (code) {
      await actions.linkByInviteCode(code.toUpperCase());
    }
    setSubmitting(false);
    onComplete();
  };

  if (role === 'manager') {
    return (
      <div className="px-5 pt-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <h1 className="text-center text-xl font-bold text-primary mb-6">스터디 벅스</h1>

        <div className="rounded-3xl bg-gradient-to-br from-primary-container/30 via-secondary-container/20 to-tertiary-container/30 p-6 mb-6 text-center">
          <div className="text-5xl mb-3">🤝📚</div>
          <h2 className="text-2xl font-extrabold text-on-surface mb-1">학생과 연결해볼게요</h2>
          <p className="text-sm text-on-surface-variant">학생에게 받은 초대코드를 입력하면 학습 현황을 함께 볼 수 있어요.</p>
        </div>

        <div className="space-y-5">
          <TextField label="학생 초대코드 입력" value={inviteCodeInput} onChange={setInviteCodeInput} placeholder="학생에게 받은 8자리 코드" />
        </div>

        <Button className="w-full mt-8" onClick={handleManagerSubmit} disabled={submitting}>
          {submitting ? '연결하는 중...' : '시작하기'}
        </Button>
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-xl font-bold text-primary mb-6">스터디 벅스</h1>

      <div className="rounded-3xl bg-gradient-to-br from-primary-container/30 via-secondary-container/20 to-tertiary-container/30 p-6 mb-6 text-center">
        <div className="text-5xl mb-3">🤖📚</div>
        <h2 className="text-2xl font-extrabold text-on-surface mb-1">나를 가장 잘 아는 학습 파트너</h2>
        <p className="text-sm text-on-surface-variant">나에게 맞는 학습 루틴을 함께 만들어볼게요.</p>
      </div>

      <div className="space-y-5">
        <SelectField label="학년" value={grade} onChange={(v) => setGrade(v as Grade)} options={GRADES.map((g) => ({ id: g, label: g }))} />

        <div>
          <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">주요 과목</label>
          <ChipGroup options={SUBJECTS} value={mainSubjects} onChange={setMainSubjects} multi />
        </div>

        <TextField label="학습 목표" value={goal} onChange={setGoal} placeholder='예: "내신 수학 2등급 목표"' />
        <TextField label="시험 일정" value={examDate} onChange={setExamDate} type="date" />
        <TextField label="사용하는 문제집" value={workbooks} onChange={setWorkbooks} placeholder="예: 쎈 수학, 자이스토리 영어" />
      </div>

      <Button className="w-full mt-8" onClick={handleStudentSubmit} disabled={submitting}>
        {submitting ? '시작하는 중...' : '시작하기'}
      </Button>
    </div>
  );
}
