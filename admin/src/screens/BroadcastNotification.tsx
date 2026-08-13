import React from 'react';
import { supabase } from '../lib/supabase';

export default function BroadcastNotification() {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    if (!window.confirm('전체 사용자에게 알림을 보낼까요? 되돌릴 수 없어요.')) return;
    setError(null);
    setResult(null);
    setSending(true);
    const { data, error: invokeError } = await supabase.functions.invoke('broadcast-notification', {
      body: { title: title.trim(), body: body.trim() },
    });
    setSending(false);
    if (invokeError) {
      setError(invokeError.message);
      return;
    }
    if (data?.error) {
      setError(data.error);
      return;
    }
    setResult(`${data.total}개 기기 중 ${data.sent}개에 발송했어요.`);
    setTitle('');
    setBody('');
  };

  return (
    <div className="max-w-md">
      <h2 className="text-base font-bold mb-4">전체 공지 발송</h2>
      <form onSubmit={handleSend} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="예: 서버 점검 안내"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">내용</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="예: 오늘 밤 12시부터 1시간 동안 서버 점검이 있어요."
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && <p className="text-sm text-gray-600">{result}</p>}
        <button type="submit" disabled={sending} className="w-full rounded-lg bg-gray-900 text-white font-semibold py-2 text-sm disabled:opacity-50">
          {sending ? '발송 중...' : '전체 발송'}
        </button>
      </form>
      <p className="text-xs text-gray-400 mt-2">앱을 켜고 알림 권한을 허용한 학생/선생님 기기에만 도착해요.</p>
    </div>
  );
}
