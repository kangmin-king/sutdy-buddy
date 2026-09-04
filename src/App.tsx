import React from 'react';
import { AuthProvider, useAuth } from './state/AuthContext';
import { ThemeProvider } from './state/ThemeContext';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { BottomNav, Card, Button, TopAppBar } from './primitives';
import { STUDENT_NAV_TABS } from './constants';
import AuthScreen from './screens/AuthScreen';
import ResetPasswordScreen from './screens/ResetPassword';
import OnboardingScreen from './screens/Onboarding';
import DistractionStopScreen from './screens/DistractionStop';
import StudentHomeScreen from './screens/student/StudentHome';
import MockExamTimerScreen from './screens/student/MockExamTimer';
import MyPageScreen from './screens/student/MyPage';
import StudentCalendarScreen from './screens/student/StudentCalendar';
import ManagerStudentListScreen from './screens/manager/ManagerStudentList';
import StudentSelector from './screens/manager/StudentSelector';
import ManagerHomeScreen from './screens/manager/ManagerHome';
import ManagerProgressScreen from './screens/manager/ManagerProgress';
import ManagerCalendarScreen from './screens/manager/ManagerCalendar';
import { App as CapacitorApp } from '@capacitor/app';
import { useOpenDistractionStopRequest, isNativePlatform } from './native/distractionStop';
import { usePushRegistration } from './native/push';
import { usePendingStudyPause } from './screens/student/usePendingStudyPause';
import { useAllowedAppUsageFlush } from './screens/student/useAllowedAppUsageFlush';
import { track } from './lib/analytics';

const MANAGER_TABS = [
  { id: 'calendar', label: '캘린더', icon: 'calendar_today' },
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'progress', label: '진도관리', icon: 'trending_up' },
] as const;

// 쓰기 실패/초대코드 오류 같은 전역 오류는 어느 셸(학생/관리자/레거시)에 있든 보여야 한다.
function ErrorBanner() {
  const { state, actions } = useAppState();
  if (!state.error) return null;
  return (
    <Card className="mx-5 mt-4 flex items-center justify-between gap-3 border border-error/40">
      <p className="text-sm text-error">{state.error}</p>
      <Button variant="error" onClick={actions.dismissError} className="!px-3 !py-1.5 shrink-0">
        닫기
      </Button>
    </Card>
  );
}

function AppShell() {
  const { state, actions } = useAppState();

  // 학생/선생님 셸 공통 진입점이라 여기 한 번만 등록하면 역할과 무관하게 기기 토큰이 저장된다.
  usePushRegistration(React.useCallback((token: string) => actions.registerDeviceToken(token), [actions]));

  // 프로필이 아직 없으면 역할을 알 수 없다 — 로딩 중이거나 온보딩을 안 끝낸 계정이다.
  if (state.loading || !state.profile) {
    return <BootstrapShell />;
  }

  if (state.profile.role === 'manager') {
    return <ManagerAppShell />;
  }

  return <StudentAppShell />;
}

function StudentAppShell() {
  const [activeTab, setActiveTab] = React.useState<(typeof STUDENT_NAV_TABS)[number]['id']>('home');
  const [showDistractionStop, setShowDistractionStop] = React.useState(false);
  const [showMockExam, setShowMockExam] = React.useState(false);

  // 알림으로 여는 경로와 화면 버튼으로 여는 경로를 분석에서 구분한다 — 설정을 끝낸 학생이
  // 실제로 어느 쪽으로 들어오는지가 이 기능의 재방문을 좌우한다.
  //
  // 예전에는 'fab'(오른쪽 가장자리에 붙어 있던 자물쇠 버튼)도 있었다. 그걸 없앨지 판단하려고
  // 경로를 나눠 세고 있었는데, "나" 탭 학습 도구에 같은 항목이 이미 있어 중복이라 2026-09-04에
  // FAB을 제거했다. 남은 두 경로는 성격이 달라서 계속 구분한다.
  const openDistractionStop = React.useCallback((entryPoint: 'notification' | 'my_page') => {
    setShowDistractionStop(true);
    track('Opened Distraction Stop', { entry_point: entryPoint });
  }, []);

  // 딴짓 멈춰는 설정 후에는 대부분 네이티브 알림(상단바 내려서)으로 여닫는다 — 그 요청이 오면
  // 탭 전환 대신 이 오버레이를 띄운다.
  useOpenDistractionStopRequest(React.useCallback(() => openDistractionStop('notification'), [openDistractionStop]));

  // 쉬는 시간이 시작되면 네이티브가 표식을 남긴다. 오버레이가 떠서 학생 홈이 언마운트돼도
  // 처리되어야 하므로 셸에서 부른다.
  usePendingStudyPause();

  // 허용앱 사용 구간도 같은 이유로 셸에서 처리한다 — 오버레이가 떠도 계속 돌아야 한다.
  useAllowedAppUsageFlush();

  // 이 오버레이가 떠 있는 동안은 휴대폰 뒤로 가기 버튼도 왼쪽 위 화살표랑 똑같이 오버레이만
  // 닫아야 한다 — 기본 동작대로 두면 뒤로 가기가 앱을 통째로 나가버린다.
  React.useEffect(() => {
    if (!showDistractionStop || !isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener('backButton', () => setShowDistractionStop(false));
    return () => {
      listenerPromise.then((handle) => handle.remove());
    };
  }, [showDistractionStop]);

  if (showDistractionStop) {
    return (
      <div id="app-shell">
        <ErrorBanner />
        <DistractionStopScreen onClose={() => setShowDistractionStop(false)} />
      </div>
    );
  }

  if (showMockExam) {
    return (
      <div id="app-shell">
        <ErrorBanner />
        <MockExamTimerScreen onClose={() => setShowMockExam(false)} />
      </div>
    );
  }

  return (
    <div id="app-shell">
      <ErrorBanner />
      {activeTab === 'home' && <StudentHomeScreen onNavigateToCalendar={() => setActiveTab('calendar')} />}
      {activeTab === 'calendar' && <StudentCalendarScreen />}
      {activeTab === 'me' && (
        <MyPageScreen onOpenMockExam={() => setShowMockExam(true)} onOpenDistractionStop={() => openDistractionStop('my_page')} />
      )}
      <BottomNav tabs={STUDENT_NAV_TABS} active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

function ManagerAppShell() {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<(typeof MANAGER_TABS)[number]['id']>('home');
  // 학생 목록의 알림 칩으로 들어온 경우엔 캘린더 탭을 열면서 그 학생의 설정 시트까지 펼친다.
  // 학생 id로 들고 있는 이유: 시트를 펼치기 전에 다른 학생으로 바꾸면 펼치지 않아야 한다.
  const [reminderSheetFor, setReminderSheetFor] = React.useState<string | null>(null);

  if (!selectedStudentId) {
    return (
      <div id="app-shell">
        <ErrorBanner />
        <ManagerStudentListScreen
          onSelectStudent={setSelectedStudentId}
          onOpenReminderSetting={(studentId) => {
            setSelectedStudentId(studentId);
            setTab('calendar');
            setReminderSheetFor(studentId);
          }}
        />
      </div>
    );
  }

  return (
    <div id="app-shell">
      <ErrorBanner />
      <TopAppBar />
      <StudentSelector selectedStudentId={selectedStudentId} onSelectStudent={setSelectedStudentId} />
      {tab === 'calendar' && (
        <ManagerCalendarScreen
          studentId={selectedStudentId}
          openReminderSheet={reminderSheetFor === selectedStudentId}
          onReminderSheetOpened={() => setReminderSheetFor(null)}
        />
      )}
      {tab === 'home' && <ManagerHomeScreen studentId={selectedStudentId} />}
      {tab === 'progress' && <ManagerProgressScreen studentId={selectedStudentId} />}
      <BottomNav tabs={MANAGER_TABS} active={tab} onChange={setTab} />
    </div>
  );
}

// 역할이 확정되기 전(로드 중)과 온보딩 전용 셸. 온보딩이 프로필을 저장하면 AppShell이 곧바로
// 학생/관리자 셸로 넘어가므로, 여기서 따로 화면을 전환할 필요가 없다.
function BootstrapShell() {
  const { state } = useAppState();

  if (state.loading) {
    return (
      <div id="app-shell" className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-on-surface-variant">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div id="app-shell">
      <ErrorBanner />
      <OnboardingScreen onComplete={() => undefined} />
    </div>
  );
}

function Gate() {
  const { session, loading, passwordRecovery } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-on-surface-variant">불러오는 중...</p>
      </div>
    );
  }

  // 비밀번호 재설정 링크로 들어온 세션은 곧바로 앱으로 들여보내지 않고 새 비밀번호부터 받는다.
  if (passwordRecovery) {
    return <ResetPasswordScreen />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ThemeProvider>
  );
}
