import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { useAuth } from '../../state/AuthContext';
import { useTheme, type Theme } from '../../state/ThemeContext';
import { todayKey, addDaysToKey, getPlannerProgress } from '../../lib';
import { Icon, ProgressRing, BottomSheet, TextField, Button, useConfirm, useDeleteAccount } from '../../primitives';
import { isNativePlatform } from '../../native/distractionStop';
import SchoolTimetableGrid from '../shared/SchoolTimetableGrid';
import LinkedManagerChips from './LinkedManagerChips';
import mascotFaceUrl from '../../assets/mascot-face.png';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function Row({
  icon,
  title,
  hint,
  onClick,
  trailing,
  danger = false,
}: {
  icon: string;
  title: string;
  hint?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
}) {
  const body = (
    <>
      <Icon name={icon} className={`!text-[20px] shrink-0 ${danger ? 'text-error' : 'text-primary'}`} />
      <span className="min-w-0 flex-1 text-left">
        <span className={`block text-sm font-semibold ${danger ? 'text-error' : 'text-on-surface'}`}>{title}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-on-surface-variant">{hint}</span>}
      </span>
      {/* 화살표는 "다음 화면으로 간다"는 뜻이다 — 로그아웃처럼 그 자리에서 끝나는 동작엔 안 붙인다. */}
      {trailing ?? (onClick && !danger && <Icon name="chevron_right" className="!text-[18px] shrink-0 text-outline-variant" />)}
    </>
  );
  const className = 'flex w-full min-h-[56px] items-center gap-3 px-4 py-2 text-left transition';
  return onClick ? (
    <button onClick={onClick} className={`${className} hover:bg-surface-container active:scale-[0.99]`}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

// 예전에는 초대코드·연결된 선생님·모의고사가 홈 맨 아래 "학습 도구" 회색 상자 안에 눌려
// 담겨 있었고, 테마 설정은 상단바 톱니 아이콘 뒤에 숨어 있었다. 오늘 할 일에 집중해야 할
// 홈에서 이것들을 빼내 제 크기로 놓는다.
export default function MyPageScreen({
  onOpenMockExam,
  onOpenDistractionStop,
}: {
  onOpenMockExam: () => void;
  onOpenDistractionStop: () => void;
}) {
  const { state, actions } = useAppState();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { confirm, confirmDialog } = useConfirm();
  const { requestDeleteAccount, deleteAccountDialog } = useDeleteAccount();
  const [timetableOpen, setTimetableOpen] = React.useState(false);
  const [editingCell, setEditingCell] = React.useState<{ weekday: number; period: number; subject: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  // 이번 주(월요일 시작) 이행률 — 하루치 계산(getPlannerProgress)을 7일에 걸쳐 합산한다.
  const weekly = React.useMemo(() => {
    const today = todayKey();
    const weekdayIndex = (new Date(today).getDay() + 6) % 7; // 월=0
    const items = Array.from({ length: 7 }, (_, i) => addDaysToKey(today, i - weekdayIndex)).flatMap(
      (key) => state.plannerItems[key] ?? [],
    );
    return getPlannerProgress(items);
  }, [state.plannerItems]);

  const inviteCode = state.profile?.inviteCode ?? '';
  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 클립보드 권한이 없는 WebView도 있다 — 실패해도 코드는 화면에 그대로 보이므로 조용히 넘어간다.
    }
  };

  const themeOptions: { id: Theme; label: string }[] = [
    { id: 'light', label: '라이트' },
    { id: 'dark', label: '다크' },
  ];

  return (
    <div className="px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">나</h1>

      <section className="mt-4 rounded-2xl bg-surface-container-lowest p-5 text-center shadow-card">
        <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-primary">
          <img src={mascotFaceUrl} alt="" className="h-full w-full object-cover" />
        </div>
        {/* 프로필에 이름 필드가 없다(Profile은 학년·목표만 갖는다) — 학년을 이름 자리에 둔다. */}
        <p className="mt-3 text-lg font-extrabold tracking-tight text-on-surface">{state.profile?.grade ?? '학생'}</p>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          {state.linkedManagers.length > 0 ? `선생님 ${state.linkedManagers.length}명과 연결됨` : '아직 연결된 선생님이 없어요'}
        </p>
        {state.profile?.goal && <p className="mt-2 break-words text-xs leading-relaxed text-on-surface-variant">목표 · {state.profile.goal}</p>}

        {inviteCode && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface-container-low px-4 py-3 text-left">
            <Icon name="link" className="!text-[19px] shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-on-surface-variant">내 초대코드</p>
              <p className="mt-0.5 font-mono text-base font-bold tracking-[0.14em] tabular-nums text-on-surface">{inviteCode}</p>
            </div>
            <button
              onClick={copyInviteCode}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-surface-container px-3 text-xs font-bold text-primary transition active:scale-[0.96]"
            >
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        )}
      </section>

      {state.linkedManagers.length > 0 && (
        <section className="mt-6" aria-labelledby="linked-managers-title">
          <h2 id="linked-managers-title" className="mb-1 text-sm font-bold text-on-surface">연결된 선생님</h2>
          <LinkedManagerChips />
        </section>
      )}

      <section className="mt-6" aria-labelledby="weekly-title">
        <h2 id="weekly-title" className="mb-2 text-sm font-bold text-on-surface">이번 주</h2>
        <div className="flex items-center gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-card">
          <ProgressRing percent={weekly.percent} size={64} stroke={8} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface">이행률 {weekly.percent}%</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant">
              {weekly.total === 0 ? '이번 주 계획이 아직 없어요' : `${weekly.total}개 중 ${weekly.completed}개 완료`}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="tools-title">
        <h2 id="tools-title" className="mb-2 text-sm font-bold text-on-surface">학습 도구</h2>
        <div className="divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-card">
          <Row icon="timer" title="모의고사 타이머" hint="실전처럼 시간 재고 풀기" onClick={onOpenMockExam} />
          {isNativePlatform() && (
            <Row icon="shield" title="딴짓 멈춰" hint="공부 중 다른 앱 차단하기" onClick={onOpenDistractionStop} />
          )}
          <Row icon="grid_on" title="학교 시간표" hint="선생님도 이 시간표를 봐요" onClick={() => setTimetableOpen(true)} />
        </div>
      </section>

      <section className="mt-6" aria-labelledby="settings-title">
        <h2 id="settings-title" className="mb-2 text-sm font-bold text-on-surface">설정</h2>
        <div className="divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-card">
          <Row
            icon="dark_mode"
            title="화면 테마"
            hint="밤에는 다크가 눈이 편해요"
            trailing={
              <div role="radiogroup" aria-label="화면 테마" className="flex shrink-0 rounded-xl bg-surface-container p-0.5">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    role="radio"
                    aria-checked={theme === opt.id}
                    onClick={() => setTheme(opt.id)}
                    // 다크에선 선택된 알약과 트랙의 명도 차가 작아 그림자로는 구분이 안 된다 — 테두리로 못박는다.
                    className={`min-h-11 rounded-[0.625rem] px-3 text-[11px] font-bold transition ${
                      theme === opt.id
                        ? 'bg-surface-container-lowest text-primary shadow-card dark:ring-1 dark:ring-primary/45'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            }
          />
          <Row
            icon="logout"
            title="로그아웃"
            danger
            onClick={async () => {
              if (await confirm('로그아웃 하시겠습니까?')) void signOut();
            }}
          />
          {/* 탈퇴는 로그아웃과 생김새가 같으면 안 된다 — 한 칸 아래 같은 빨간 줄로 두면 잘못
              누른다. 힌트로 결과를 미리 알리고, 시트에서 "탈퇴"를 입력해야 실행된다. */}
          <Row
            icon="person_remove"
            title="회원 탈퇴"
            hint="계정과 학습 기록이 모두 삭제되고 되돌릴 수 없어요"
            danger
            onClick={requestDeleteAccount}
          />
        </div>
      </section>

      <BottomSheet open={timetableOpen} onClose={() => setTimetableOpen(false)} title="학교 시간표">
        <p className="mb-3 text-xs text-on-surface-variant">칸을 눌러 과목을 입력하세요. 선생님도 이 시간표를 볼 수 있어요.</p>
        <SchoolTimetableGrid
          slots={state.schoolTimetable}
          editable
          onEditCell={(weekday, period, subject) => setEditingCell({ weekday, period, subject })}
        />
      </BottomSheet>

      <BottomSheet
        open={editingCell !== null}
        onClose={() => setEditingCell(null)}
        title={editingCell ? `${WEEKDAY_LABELS[editingCell.weekday - 1]}요일 ${editingCell.period}교시` : undefined}
      >
        {editingCell && (
          <div className="space-y-3">
            <TextField
              label="과목"
              value={editingCell.subject}
              onChange={(value) => setEditingCell((c) => c && { ...c, subject: value })}
              placeholder="예: 수학"
            />
            <Button
              className="w-full"
              onClick={() => {
                actions.upsertSchoolTimetableSlot(editingCell.weekday, editingCell.period, editingCell.subject);
                setEditingCell(null);
              }}
            >
              저장
            </Button>
          </div>
        )}
      </BottomSheet>

      {confirmDialog}
      {deleteAccountDialog}
    </div>
  );
}
