import React from 'react';
import { supabase } from '../lib/supabase';
import { Card, Button, Chip, TextField } from '../primitives';
import type { Role } from '../types';

export default function AuthScreen() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mode, setMode] = React.useState<'signIn' | 'signUp'>('signIn');
  const [role, setRole] = React.useState<Role>('student');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const { error: authError } =
      mode === 'signUp'
        ? await supabase.auth.signUp({ email, password, options: { data: { role } } })
        : await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (authError) setError(authError.message);
  };

  return (
    <div className="px-5 pt-24">
      <Card>
        <h1 className="text-xl font-bold text-primary text-center mb-4">스터디 버디</h1>
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
