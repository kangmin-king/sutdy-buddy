import React from 'react';
import { supabase } from '../lib/supabase';

// 셀프 회원가입 버튼이 없다 — 어드민 계정은 기존 관리자가 발급해줘야만 생긴다.
export default function AdminLogin() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) setError(signInError.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h1 className="text-lg font-bold text-center">스터디 버디 어드민</h1>
        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1">이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-1">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-gray-900 text-white font-semibold py-2.5 text-sm disabled:opacity-50"
        >
          {submitting ? '로그인하는 중...' : '로그인'}
        </button>
      </form>
    </div>
  );
}
