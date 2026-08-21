import React from 'react';
import { supabase } from '../lib/supabase';
import { useEnabledSocialProviders, signInWithProvider, type SocialProvider } from '../lib/socialAuth';
import { Card, Button, Chip, TextField } from '../primitives';
import type { Role } from '../types';

// 메일 링크(가입 확인·비밀번호 재설정)는 앱이 아니라 웹으로 열린다. 앱에서 요청했더라도 폰
// 기본 브라우저가 링크를 여는 구조라, 항상 배포된 웹 주소로 보낸다.
const APP_WEB_URL = 'https://app.studybuks.store';

// 사용자에게 그대로 보여줘도 되는 흔한 에러만 한국어로 바꾼다. 모르는 메시지는 그냥 일반적인
// 문구로 뭉뚱그린다 — Supabase 원문 영어를 그대로 노출하지 않기 위해서다.
function friendlyAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (message.includes('User already registered')) return '이미 가입된 이메일이에요. 로그인해주세요.';
  if (message.includes('Password should be at least')) return '비밀번호는 6자 이상이어야 해요.';
  if (message.includes('Unable to validate email address') || message.includes('email_address_invalid') || /is invalid/i.test(message)) return '이메일 형식이 올바르지 않아요.';
  if (message.includes('Email not confirmed')) return '이메일 인증이 아직 안 됐어요. 메일함을 확인해주세요.';
  if (message.includes('For security purposes') || message.includes('rate limit')) return '잠시 후에 다시 시도해주세요.';
  return '처리하지 못했어요. 잠시 후 다시 시도해주세요.';
}

const PROVIDER_LABEL: Record<SocialProvider, string> = {
  kakao: '카카오로 계속하기',
  google: 'Google로 계속하기',
};

function ProviderIcon({ provider }: { provider: SocialProvider }) {
  if (provider === 'kakao') {
    return (
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3C6.99 3 3 6.24 3 10.2c0 2.52 1.68 4.74 4.2 6.03l-1.05 3.87c-.09.33.27.6.57.42l4.62-3.06c.21.02.44.03.66.03 5.01 0 9-3.24 9-7.29S17.01 3 12 3Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.57-5.17 3.57-8.87Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l3.99-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.96 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.63l3.99 3.09C6.22 6.87 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

function SocialButton({ provider, onClick, disabled }: { provider: SocialProvider; onClick: () => void; disabled: boolean }) {
  const style =
    provider === 'kakao' ? 'bg-[#FEE500] text-[#191600]' : 'bg-surface text-on-surface border-[1.5px] border-outline-variant';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-full font-semibold text-sm px-5 py-3 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-50 ${style}`}
    >
      <ProviderIcon provider={provider} />
      {PROVIDER_LABEL[provider]}
    </button>
  );
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
      redirectTo: APP_WEB_URL,
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

/**
 * 이메일 인증이 켜져 있으면 가입 직후엔 세션이 없다. 여기서 멈춰 메일을 확인하라고 알려주고,
 * 메일이 안 왔을 때 빠져나갈 구멍(재발송)을 반드시 같이 준다 — 스팸함으로 갔을 때 아무것도
 * 못 하고 막히는 게 가장 나쁜 결말이다.
 */
function CheckInboxCard({ email, onBack }: { email: string; onBack: () => void }) {
  const [resent, setResent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleResend = async () => {
    setError(null);
    setSubmitting(true);
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: APP_WEB_URL },
    });
    setSubmitting(false);
    if (resendError) {
      setError(friendlyAuthError(resendError.message));
      return;
    }
    setResent(true);
  };

  return (
    <Card>
      <h1 className="text-xl font-bold text-primary text-center mb-3">메일함을 확인해주세요</h1>
      <p className="text-sm text-on-surface-variant text-center">
        <span className="font-semibold text-on-surface">{email}</span>로 인증 메일을 보냈어요. 메일 안의 링크를 눌러야 가입이
        끝나요.
      </p>
      <p className="text-xs text-on-surface-variant text-center mt-2">메일이 안 보이면 스팸함도 확인해주세요.</p>
      {error && <p className="text-sm text-error mt-3 text-center">{error}</p>}
      {resent ? (
        <p className="text-sm text-secondary text-center mt-4">인증 메일을 다시 보냈어요.</p>
      ) : (
        <Button variant="ghost" className="w-full mt-4" onClick={handleResend} disabled={submitting}>
          인증 메일 다시 보내기
        </Button>
      )}
      <button onClick={onBack} className="w-full text-center text-sm text-on-surface-variant mt-3">
        로그인으로 돌아가기
      </button>
    </Card>
  );
}

export default function AuthScreen() {
  const providers = useEnabledSocialProviders();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mode, setMode] = React.useState<'signIn' | 'signUp' | 'forgotPassword'>('signIn');
  const [emailFormOpen, setEmailFormOpen] = React.useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<Role>('student');
  const [error, setError] = React.useState<string | null>(null);
  // 미인증 계정으로 로그인을 시도했을 때만 재발송 버튼을 띄운다.
  const [needsConfirmation, setNeedsConfirmation] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  if (pendingConfirmEmail) {
    return (
      <div className="px-5 pt-24">
        <CheckInboxCard
          email={pendingConfirmEmail}
          onBack={() => {
            setPendingConfirmEmail(null);
            setMode('signIn');
          }}
        />
      </div>
    );
  }

  if (mode === 'forgotPassword') {
    return (
      <div className="px-5 pt-24">
        <ForgotPasswordCard onBack={() => setMode('signIn')} />
      </div>
    );
  }

  const handleSocial = async (provider: SocialProvider) => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithProvider(provider);
      // 웹은 이 시점에 페이지가 통째로 이동하고, 앱은 시스템 브라우저가 위에 뜬다. 어느 쪽이든
      // 이 화면을 더 그릴 일이 없어서 submitting은 풀지 않는다.
    } catch {
      setSubmitting(false);
      setError('로그인 창을 열지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setNeedsConfirmation(false);
    setSubmitting(true);

    if (mode === 'signUp') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { role }, emailRedirectTo: APP_WEB_URL },
      });
      setSubmitting(false);
      if (signUpError) {
        setError(friendlyAuthError(signUpError.message));
        return;
      }
      // 이메일 인증이 켜져 있으면 세션 없이 사용자만 만들어진다. 그때는 확인 안내로 넘어간다.
      if (!data.session) setPendingConfirmEmail(email);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(friendlyAuthError(signInError.message));
      if (signInError.message.includes('Email not confirmed')) setNeedsConfirmation(true);
    }
  };

  const handleResendFromSignIn = async () => {
    setSubmitting(true);
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: APP_WEB_URL },
    });
    setSubmitting(false);
    if (resendError) {
      setError(friendlyAuthError(resendError.message));
      return;
    }
    setNeedsConfirmation(false);
    setPendingConfirmEmail(email);
  };

  return (
    <div className="px-5 pt-24">
      <Card>
        <h1 className="text-xl font-bold text-primary text-center mb-1">스터디 벅스</h1>
        <p className="text-xs text-on-surface-variant text-center mb-5">공부 계획, 오늘부터 같이 해요</p>

        <div className="space-y-2">
          {providers.map((p) => (
            <SocialButton key={p} provider={p} onClick={() => handleSocial(p)} disabled={submitting} />
          ))}
        </div>

        {!emailFormOpen ? (
          <>
            {error && <p className="text-sm text-error mt-3 text-center">{error}</p>}
            <button onClick={() => setEmailFormOpen(true)} className="w-full text-center text-xs text-on-surface-variant mt-5 underline">
              이메일로 계속하기
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-outline-variant" />
              <span className="text-xs text-on-surface-variant">이메일로 계속하기</span>
              <div className="h-px flex-1 bg-outline-variant" />
            </div>

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
            {mode === 'signUp' && (
              <p className="text-[11px] text-on-surface-variant mt-2">
                비밀번호를 잊었을 때 쓰니, 실제로 받아볼 수 있는 메일 주소를 넣어주세요.
              </p>
            )}
            {mode === 'signIn' && (
              <button onClick={() => setMode('forgotPassword')} className="w-full text-right text-xs text-on-surface-variant mt-2">
                비밀번호를 잊으셨나요?
              </button>
            )}
            {error && <p className="text-sm text-error mt-3">{error}</p>}
            {needsConfirmation && (
              <Button variant="ghost" className="w-full mt-3" onClick={handleResendFromSignIn} disabled={submitting}>
                인증 메일 다시 보내기
              </Button>
            )}
            <Button className="w-full mt-4" onClick={handleSubmit} disabled={submitting}>
              {mode === 'signUp' ? '회원가입' : '로그인'}
            </Button>
            <button
              onClick={() => {
                setMode((m) => (m === 'signUp' ? 'signIn' : 'signUp'));
                setError(null);
                setNeedsConfirmation(false);
              }}
              className="w-full text-center text-sm text-on-surface-variant mt-3"
            >
              {mode === 'signUp' ? '이미 계정이 있어요' : '처음이에요, 회원가입할게요'}
            </button>
          </>
        )}
      </Card>
    </div>
  );
}
