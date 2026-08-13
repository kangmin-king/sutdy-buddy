import React from 'react';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';
import AdminLogin from './screens/AdminLogin';
import AdminShell from './AdminShell';

export default function App() {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-gray-500">불러오는 중...</div>
    );
  }

  if (!session) {
    return <AdminLogin />;
  }

  return <AdminShell session={session} />;
}
