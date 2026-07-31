import React from 'react';
import { supabase } from '../lib/supabase';
import { Card, Button, TextField } from '../primitives';

export default function AuthScreen() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mode, setMode] = React.useState<'signIn' | 'signUp'>('signIn');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const { error: authError } =
      mode === 'signUp' ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (authError) setError(authError.message);
  };

  return (
    <div className="px-5 pt-24">
      <Card>
        <h1 className="text-xl font-bold text-primary text-center mb-4">스터디 버디</h1>
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
