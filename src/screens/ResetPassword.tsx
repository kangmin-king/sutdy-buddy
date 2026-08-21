import React from 'react';
import { supabase } from '../lib/supabase';
import { Card, Button, TextField } from '../primitives';
import { useAuth } from '../state/AuthContext';

// 이메일의 "비밀번호 재설정" 링크를 눌러서 들어온 경우에만 뜨는 화면(AuthContext의
// passwordRecovery가 true일 때). 새 비밀번호를 설정하면 평소 앱으로 넘어간다.
export default function ResetPasswordScreen() {
  const { clearPasswordRecovery } = useAuth();
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 해요.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 서로 달라요.');
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError('비밀번호를 바꾸지 못했어요. 다시 시도해주세요.');
      return;
    }
    clearPasswordRecovery();
  };

  return (
    <div className="px-5 pt-24">
      <Card>
        <h1 className="text-xl font-bold text-primary text-center mb-2">새 비밀번호 설정</h1>
        <p className="text-sm text-on-surface-variant text-center mb-4">새로 쓸 비밀번호를 입력해주세요.</p>
        <div className="space-y-3">
          <TextField label="새 비밀번호" value={password} onChange={setPassword} placeholder="********" type="password" />
          <TextField label="새 비밀번호 확인" value={confirmPassword} onChange={setConfirmPassword} placeholder="********" type="password" />
        </div>
        {error && <p className="text-sm text-error mt-3">{error}</p>}
        <Button className="w-full mt-4" onClick={handleSubmit} disabled={submitting}>
          비밀번호 바꾸기
        </Button>
      </Card>
    </div>
  );
}
