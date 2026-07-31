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
import type { PlannerItem } from './types';

type Overlay = 'condition' | 'studyLog' | 'aiRecommendation' | null;

function AppShell() {
  const { state, actions } = useAppState();
  const [activeTab, setActiveTab] = React.useState<TabId>('home');
  const [overlay, setOverlay] = React.useState<Overlay>(null);
  const [studyLogItem, setStudyLogItem] = React.useState<PlannerItem | null>(null);

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
    overlayScreen = (
      <TomorrowRecommendationScreen
        onBack={closeOverlay}
        onApplied={() => {
          closeOverlay();
          setActiveTab('home');
        }}
      />
    );
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
          {activeTab === 'ai' && <TomorrowRecommendationScreen onBack={() => setActiveTab('home')} onApplied={() => setActiveTab('home')} />}
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
