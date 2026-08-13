import React from 'react';
import { supabase } from '../lib/supabase';
import type { AdminUserRow } from '../types';

export default function OperatorManager() {
  const [users, setUsers] = React.useState<AdminUserRow[]>([]);
  const [email, setEmail] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [issued, setIssued] = React.useState<{ email: string; password: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const { data } = await supabase.from('sb_admin_users').select('*').order('created_at', { ascending: false });
    setUsers((data as AdminUserRow[] | null) ?? []);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!email.trim()) return;
    setError(null);
    setCreating(true);
    const { data, error: invokeError } = await supabase.functions.invoke('create-admin-user', { body: { email: email.trim() } });
    setCreating(false);
    if (invokeError) {
      setError(invokeError.message);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    setIssued({ email: data.email, password: data.password });
    setEmail('');
    load();
  };

  const handleRemove = async (id: string) => {
    if (!window.confirm('이 운영자의 어드민 권한을 없앨까요? (로그인 계정 자체는 남아요)')) return;
    await supabase.from('sb_admin_users').delete().eq('id', id);
    load();
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-bold mb-4">운영자 관리</h2>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        <label className="block text-xs font-semibold text-gray-600 mb-1">새 운영자 이메일</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="operator@example.com"
          />
          <button onClick={handleCreate} disabled={creating} className="rounded-lg bg-gray-900 text-white font-semibold px-4 py-2 text-sm disabled:opacity-50">
            {creating ? '만드는 중...' : '추가'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {issued && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-semibold mb-1">운영자 계정이 만들어졌어요 — 아래 정보를 전달해주세요</p>
            <p>이메일: {issued.email}</p>
            <p>임시 비밀번호: {issued.password}</p>
            <p className="text-xs text-gray-500 mt-1">로그인 후 "내 계정"에서 비밀번호를 바꾸라고 안내해주세요.</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{u.role === 'admin' ? '관리자' : '운영자'}</p>
              <p className="text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString('ko-KR')}</p>
            </div>
            {u.role === 'operator' && (
              <button onClick={() => handleRemove(u.id)} className="text-sm text-red-600 underline">
                삭제
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
