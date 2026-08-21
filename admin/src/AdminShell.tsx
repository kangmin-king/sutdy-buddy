import React from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { AdminUserRow } from './types';
import BannerManager from './screens/BannerManager';
import OperatorManager from './screens/OperatorManager';
import AccountSettings from './screens/AccountSettings';
import MembersOverview from './screens/MembersOverview';
import BroadcastNotification from './screens/BroadcastNotification';

type Tab = 'banners' | 'members' | 'broadcast' | 'operators' | 'account';

export default function AdminShell({ session }: { session: Session }) {
  const [me, setMe] = React.useState<AdminUserRow | null | undefined>(undefined);
  const [tab, setTab] = React.useState<Tab>('banners');

  React.useEffect(() => {
    supabase
      .from('sb_admin_users')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setMe((data as AdminUserRow | null) ?? null));
  }, [session.user.id]);

  if (me === undefined) {
    return <div className="flex items-center justify-center min-h-screen text-sm text-gray-500">불러오는 중...</div>;
  }

  if (me === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 px-5 text-center">
        <p className="text-sm text-gray-600">이 계정은 어드민 권한이 없어요.</p>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-gray-500 underline">
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-base font-bold">스터디 벅스 어드민</h1>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-gray-500">
          로그아웃
        </button>
      </header>

      <nav className="flex gap-1 px-5 pt-3 border-b border-gray-200 bg-white">
        <button
          onClick={() => setTab('banners')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === 'banners' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
        >
          배너 관리
        </button>
        {me.role === 'admin' && (
          <button
            onClick={() => setTab('members')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === 'members' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
          >
            회원 현황
          </button>
        )}
        {me.role === 'admin' && (
          <button
            onClick={() => setTab('broadcast')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === 'broadcast' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
          >
            전체 공지
          </button>
        )}
        {me.role === 'admin' && (
          <button
            onClick={() => setTab('operators')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === 'operators' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
          >
            운영자 관리
          </button>
        )}
        <button
          onClick={() => setTab('account')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === 'account' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
        >
          내 계정
        </button>
      </nav>

      <main className="p-5">
        {tab === 'banners' && <BannerManager userId={session.user.id} />}
        {tab === 'members' && me.role === 'admin' && <MembersOverview />}
        {tab === 'broadcast' && me.role === 'admin' && <BroadcastNotification />}
        {tab === 'operators' && me.role === 'admin' && <OperatorManager />}
        {tab === 'account' && <AccountSettings email={session.user.email ?? ''} />}
      </main>
    </div>
  );
}
