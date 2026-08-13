import React from 'react';
import { supabase } from '../lib/supabase';

interface AdminUserSummary {
  id: string;
  email: string;
  role: 'student' | 'manager';
  grade: string | null;
  onboardedAt: string;
  linkedCount: number;
}

interface Stats {
  totalStudents: number;
  totalManagers: number;
  signupsToday: number;
  signupsThisWeek: number;
}

export default function MembersOverview() {
  const [users, setUsers] = React.useState<AdminUserSummary[]>([]);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('admin-users-overview');
    setLoading(false);
    if (invokeError) {
      setError(invokeError.message);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    setUsers(data.users);
    setStats(data.stats);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = users.filter((u) => u.email.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-bold mb-4">회원 현황</h2>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">전체 학생</p>
            <p className="text-xl font-bold">{stats.totalStudents}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">전체 선생님</p>
            <p className="text-xl font-bold">{stats.totalManagers}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">오늘 가입</p>
            <p className="text-xl font-bold">{stats.signupsToday}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">이번주 가입</p>
            <p className="text-xl font-bold">{stats.signupsThisWeek}</p>
          </div>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이메일로 검색"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3"
      />

      {loading && <p className="text-sm text-gray-400">불러오는 중...</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">이메일</th>
              <th className="text-left px-4 py-2 font-semibold">역할</th>
              <th className="text-left px-4 py-2 font-semibold">학년</th>
              <th className="text-left px-4 py-2 font-semibold">연결 수</th>
              <th className="text-left px-4 py-2 font-semibold">가입일</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-4 py-2 truncate max-w-[220px]">{u.email}</td>
                <td className="px-4 py-2">{u.role === 'student' ? '학생' : '선생님'}</td>
                <td className="px-4 py-2">{u.grade ?? '-'}</td>
                <td className="px-4 py-2">{u.linkedCount}</td>
                <td className="px-4 py-2 text-gray-500">{new Date(u.onboardedAt).toLocaleDateString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-10">회원이 없어요.</p>}
      </div>
    </div>
  );
}
