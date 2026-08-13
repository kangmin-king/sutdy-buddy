import React from 'react';
import { supabase } from '../lib/supabase';

export default function AccountSettings({ email }: { email: string }) {
  const [newEmail, setNewEmail] = React.useState(email);
  const [newPassword, setNewPassword] = React.useState('');
  const [emailStatus, setEmailStatus] = React.useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = React.useState<string | null>(null);

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailStatus(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailStatus(error ? error.message : '변경 확인 메일을 새 이메일로 보냈어요. 메일함을 확인해주세요.');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);
    if (newPassword.length < 6) {
      setPasswordStatus('비밀번호는 6자 이상이어야 해요.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordStatus(error ? error.message : '비밀번호가 바뀌었어요.');
    if (!error) setNewPassword('');
  };

  return (
    <div className="max-w-md space-y-6">
      <h2 className="text-base font-bold">내 계정</h2>

      <form onSubmit={handleEmailChange} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold">이메일 변경</p>
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        {emailStatus && <p className="text-xs text-gray-600">{emailStatus}</p>}
        <button type="submit" className="rounded-lg bg-gray-900 text-white font-semibold px-4 py-2 text-sm">
          이메일 변경
        </button>
      </form>

      <form onSubmit={handlePasswordChange} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold">비밀번호 변경</p>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="새 비밀번호"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        {passwordStatus && <p className="text-xs text-gray-600">{passwordStatus}</p>}
        <button type="submit" className="rounded-lg bg-gray-900 text-white font-semibold px-4 py-2 text-sm">
          비밀번호 변경
        </button>
      </form>
    </div>
  );
}
