import React from 'react';
import { AuthProvider, useAuth } from './state/AuthContext';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { BottomNav, Card, Button, TopAppBar } from './primitives';
import type { TabId } from './primitives';
import { NAV_TABS, STUDENT_NAV_TABS } from './constants';
import AuthScreen from './screens/AuthScreen';
import ResetPasswordScreen from './screens/ResetPassword';
import OnboardingScreen from './screens/Onboarding';
import HomeScreen from './screens/Home';
import CalendarScreen from './screens/Calendar';
import PlannerCreateScreen from './screens/PlannerCreate';
import ExecutionCheckScreen from './screens/ExecutionCheck';
import ConditionInputScreen from './screens/ConditionInput';
import StudyLogScreen from './screens/StudyLog';
import TomorrowRecommendationScreen from './screens/TomorrowRecommendation';
import DistractionStopScreen from './screens/DistractionStop';
import StudentHomeScreen from './screens/student/StudentHome';
import MockExamTimerScreen from './screens/student/MockExamTimer';
import StudentPlannerScreen from './screens/student/StudentPlanner';
import StudentCalendarScreen from './screens/student/StudentCalendar';
import DistractionFab from './screens/shared/DistractionFab';
import ManagerStudentListScreen from './screens/manager/ManagerStudentList';
import StudentSelector from './screens/manager/StudentSelector';
import ManagerHomeScreen from './screens/manager/ManagerHome';
import ManagerProgressScreen from './screens/manager/ManagerProgress';
import ManagerCalendarScreen from './screens/manager/ManagerCalendar';
import { App as CapacitorApp } from '@capacitor/app';
import { useOpenDistractionStopRequest, isNativePlatform } from './native/distractionStop';
import { usePushRegistration } from './native/push';
import type { PlannerItem } from './types';

type Overlay = 'condition' | 'studyLog' | 'aiRecommendation' | null;

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

  if (state.loading || !state.profile) {
    return <LegacyStudentAppShell />;
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

  // 딴짓 멈춰는 설정 후에는 대부분 네이티브 알림(상단바 내려서)으로 여닫는다 — 그 요청이 오면
  // 탭 전환 대신 이 오버레이를 띄운다.
  useOpenDistractionStopRequest(React.useCallback(() => setShowDistractionStop(true), []));

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
      {activeTab === 'home' && (
        <StudentHomeScreen onNavigateToCalendar={() => setActiveTab('calendar')} onOpenMockExam={() => setShowMockExam(true)} />
      )}
      {activeTab === 'calendar' && <StudentCalendarScreen />}
      {activeTab === 'planner' && <StudentPlannerScreen />}
      <DistractionFab onOpen={() => setShowDistractionStop(true)} />
      <BottomNav tabs={STUDENT_NAV_TABS} active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

function ManagerAppShell() {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<(typeof MANAGER_TABS)[number]['id']>('home');

  if (!selectedStudentId) {
    return (
      <div id="app-shell">
        <ErrorBanner />
        <ManagerStudentListScreen onSelectStudent={setSelectedStudentId} />
      </div>
    );
  }

  return (
    <div id="app-shell">
      <ErrorBanner />
      <TopAppBar />
      <StudentSelector selectedStudentId={selectedStudentId} onSelectStudent={setSelectedStudentId} />
      {tab === 'calendar' && <ManagerCalendarScreen studentId={selectedStudentId} />}
      {tab === 'home' && <ManagerHomeScreen studentId={selectedStudentId} />}
      {tab === 'progress' && <ManagerProgressScreen studentId={selectedStudentId} />}
      <BottomNav tabs={MANAGER_TABS} active={tab} onChange={setTab} />
    </div>
  );
}

function LegacyStudentAppShell() {
  const { state } = useAppState();
  const [activeTab, setActiveTab] = React.useState<TabId>('home');
  const [overlay, setOverlay] = React.useState<Overlay>(null);
  const [studyLogItem, setStudyLogItem] = React.useState<PlannerItem | null>(null);

  useOpenDistractionStopRequest(React.useCallback(() => setActiveTab('distractionStop'), []));

  if (state.loading) {
    return (
      <div id="app-shell" className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-on-surface-variant">불러오는 중...</p>
      </div>
    );
  }

  if (!state.profile) {
    return (
      <div id="app-shell">
        <OnboardingScreen onComplete={() => setActiveTab('home')} />
      </div>
    );
  }

  const openStudyLog = (item: PlannerItem) => {
    setStudyLogItem(item);
    setOverlay('studyLog');
  };
  const closeOverlay = () => setOverlay(null);

  let overlayScreen: React.ReactNode = null;
  if (overlay === 'condition') {
    overlayScreen = <ConditionInputScreen onBack={closeOverlay} />;
  } else if (overlay === 'studyLog' && studyLogItem) {
    overlayScreen = <StudyLogScreen plannerItem={studyLogItem} onBack={closeOverlay} />;
  } else if (overlay === 'aiRecommendation') {
    overlayScreen = <TomorrowRecommendationScreen onBack={closeOverlay} />;
  }

  return (
    <div id="app-shell">
      <ErrorBanner />
      {overlayScreen ?? (
        <>
          {activeTab === 'home' && <HomeScreen onNavigate={setActiveTab} onOpenOverlay={setOverlay} />}
          {activeTab === 'calendar' && <CalendarScreen onNavigate={setActiveTab} />}
          {activeTab === 'planner' && <PlannerCreateScreen />}
          {activeTab === 'check' && <ExecutionCheckScreen onOpenStudyLog={openStudyLog} onOpenAiRecommendation={() => setOverlay('aiRecommendation')} />}
          {activeTab === 'distractionStop' && <DistractionStopScreen />}
          <BottomNav tabs={NAV_TABS} active={activeTab} onChange={setActiveTab} />
        </>
      )}
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
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
