import React from 'react';
import { AuthProvider, useAuth } from './state/AuthContext';
import { AppStateProvider, useAppState } from './state/AppStateContext';
import { BottomNav, Card, Button } from './primitives';
import type { TabId } from './primitives';
import AuthScreen from './screens/AuthScreen';
import OnboardingScreen from './screens/Onboarding';
import HomeScreen from './screens/Home';
import CalendarScreen from './screens/Calendar';
import PlannerCreateScreen from './screens/PlannerCreate';
import ExecutionCheckScreen from './screens/ExecutionCheck';
import ConditionInputScreen from './screens/ConditionInput';
import StudyLogScreen from './screens/StudyLog';
import TomorrowRecommendationScreen from './screens/TomorrowRecommendation';
import DistractionStopScreen from './screens/DistractionStop';
import { useOpenDistractionStopRequest } from './native/distractionStop';
import type { PlannerItem } from './types';

type Overlay = 'condition' | 'studyLog' | 'aiRecommendation' | null;

function AppShell() {
  const { state } = useAppState();

  if (state.loading || !state.profile) {
    return <LegacyStudentAppShell />;
  }

  if (state.profile.role === 'manager') {
    return <ManagerAppShell />;
  }

  return <LegacyStudentAppShell />;
}

function ManagerAppShell() {
  const { state } = useAppState();
  return (
    <div id="app-shell" className="px-5 pt-6">
      <h1 className="text-xl font-bold mb-4">관리 중인 학생</h1>
      {state.managedStudents.length === 0 && <p className="text-sm text-on-surface-variant">아직 연결된 학생이 없어요.</p>}
      {state.managedStudents.map((s, i) => (
        <div key={i} className="rounded-xl bg-surface-container-lowest p-4 mb-2 shadow-card">{s.goal || '학생'}</div>
      ))}
    </div>
  );
}

function LegacyStudentAppShell() {
  const { state, actions } = useAppState();
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
      {state.error && (
        <Card className="mx-5 mt-4 flex items-center justify-between gap-3 border border-error/40">
          <p className="text-sm text-error">{state.error}</p>
          <Button variant="error" onClick={actions.dismissError} className="!px-3 !py-1.5 shrink-0">
            닫기
          </Button>
        </Card>
      )}
      {overlayScreen ?? (
        <>
          {activeTab === 'home' && <HomeScreen onNavigate={setActiveTab} onOpenOverlay={setOverlay} />}
          {activeTab === 'calendar' && <CalendarScreen onNavigate={setActiveTab} />}
          {activeTab === 'planner' && <PlannerCreateScreen />}
          {activeTab === 'check' && <ExecutionCheckScreen onOpenStudyLog={openStudyLog} onOpenAiRecommendation={() => setOverlay('aiRecommendation')} />}
          {activeTab === 'distractionStop' && <DistractionStopScreen />}
          <BottomNav active={activeTab} onChange={setActiveTab} />
        </>
      )}
    </div>
  );
}

function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-on-surface-variant">불러오는 중...</p>
      </div>
    );
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
