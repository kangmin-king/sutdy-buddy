import React from 'react';
import { supabase } from '../lib/supabase';
import { Card, Button, Chip, TextField } from '../primitives';
import type { Role } from '../types';

// 사용자에게 그대로 보여줘도 되는 흔한 에러만 한국어로 바꾼다. 모르는 메시지는 그냥 일반적인
// 문구로 뭉뚱그린다 — Supabase 원문 영어를 그대로 노출하지 않기 위해서다.
function friendlyAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (message.includes('User already registered')) return '이미 가입된 이메일이에요. 로그인해주세요.';
  if (message.includes('Password should be at least')) return '비밀번호는 6자 이상이어야 해요.';
  if (message.includes('Unable to validate email address') || message.includes('email_address_invalid') || /is invalid/i.test(message)) return '이메일 형식이 올바르지 않아요.';
  if (message.includes('Email not confirmed')) return '이메일 인증이 아직 안 됐어요.';
  return '처리하지 못했어요. 잠시 후 다시 시도해주세요.';
}

function ForgotPasswordCard({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSend = async () => {
    setError(null);
    if (!email.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://app.studybuks.store',
    });
    setSubmitting(false);
    if (resetError) {
      setError(friendlyAuthError(resetError.message));
      return;
    }
    setSent(true);
  };

  return (
    <Card>
      <h1 className="text-xl font-bold text-primary text-center mb-4">비밀번호 찾기</h1>
      {sent ? (
        <p className="text-sm text-on-surface-variant text-center">
          {email}로 재설정 링크를 보냈어요. 메일함(스팸함도)을 확인해주세요.
        </p>
      ) : (
        <>
          <p className="text-sm text-on-surface-variant text-center mb-4">가입할 때 쓴 이메일을 입력하면 재설정 링크를 보내드려요.</p>
          <TextField label="이메일" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          {error && <p className="text-sm text-error mt-3">{error}</p>}
          <Button className="w-full mt-4" onClick={handleSend} disabled={submitting}>
            재설정 링크 보내기
          </Button>
        </>
      )}
      <button onClick={onBack} className="w-full text-center text-sm text-on-surface-variant mt-3">
        로그인으로 돌아가기
      </button>
    </Card>
  );
}

export default function AuthScreen() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mode, setMode] = React.useState<'signIn' | 'signUp' | 'forgotPassword'>('signIn');
  const [role, setRole] = React.useState<Role>('student');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  if (mode === 'forgotPassword') {
    return (
      <div className="px-5 pt-24">
        <ForgotPasswordCard onBack={() => setMode('signIn')} />
      </div>
    );
  }

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const { error: authError } =
      mode === 'signUp'
        ? await supabase.auth.signUp({ email, password, options: { data: { role } } })
        : await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (authError) setError(friendlyAuthError(authError.message));
  };

  return (
    <div className="px-5 pt-24">
      <Card>
        <h1 className="text-xl font-bold text-primary text-center mb-4">스터디 벅스</h1>
        {mode === 'signUp' && (
          <div className="flex gap-2 mb-3">
            <Chip label="학생" active={role === 'student'} onClick={() => setRole('student')} />
            <Chip label="과외쌤 · 학부모" active={role === 'manager'} onClick={() => setRole('manager')} />
          </div>
        )}
        <div className="space-y-3">
          <TextField label="이메일" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          <TextField label="비밀번호" value={password} onChange={setPassword} placeholder="********" type="password" />
        </div>
        {mode === 'signIn' && (
          <button onClick={() => setMode('forgotPassword')} className="w-full text-right text-xs text-on-surface-variant mt-2">
            비밀번호를 잊으셨나요?
          </button>
        )}
        {error && <p className="text-sm text-error mt-3">{error}</p>}
        <Button className="w-full mt-4" onClick={handleSubmit} disabled={submitting}>
          {mode === 'signUp' ? '회원가입' : '로그인'}
        </Button>
        <button
          onClick={() => setMode((m) => (m === 'signUp' ? 'signIn' : 'signUp'))}
          className="w-full text-center text-sm text-on-surface-variant mt-3"
        >
          {mode === 'signUp' ? '이미 계정이 있어요' : '처음이에요, 회원가입할게요'}
        </button>
      </Card>
    </div>
  );
}
