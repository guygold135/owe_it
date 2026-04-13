import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useIsFetching } from "@tanstack/react-query";
import { Capacitor } from '@capacitor/core';
import { BrowserRouter, HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav } from "@/components/BottomNav";
import { CreateGoalSheet } from "@/components/CreateGoalSheet";
import { AppTutorialChrome } from "@/components/AppTutorialChrome";
import { AppTutorialProvider, useAppTutorial } from "@/hooks/useAppTutorial";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useAbandonStaleJudgeRequestsOnBootstrap } from "@/hooks/useAbandonStaleJudgeRequestsOnBootstrap";
import Dashboard from "./pages/Dashboard";
import Pulse from "./pages/Pulse";
import Friends from "./pages/Friends";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import History from "./pages/History";
import MyJudges from "./pages/MyJudges";
import Profile from "./pages/Profile";
import Feedback from "./pages/Feedback";
import AdminFeedback from "./pages/AdminFeedback";
import NotFound from "./pages/NotFound";
import { JudgeRequestToastHost } from "@/components/JudgeRequestToastHost";
import { JudgeGoalCreatedNoticeHost } from "@/components/JudgeGoalCreatedNoticeHost";
import { DeadlineReminderToastHost } from "@/components/DeadlineReminderToastHost";
import { AppVersionQuote } from "@/components/AppVersionQuote";
import { PasswordRecoveryScreen } from "@/components/PasswordRecoveryScreen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function AppRoutes() {
  const { user, loading, passwordRecoveryPending } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [showSessionSplash, setShowSessionSplash] = useState(false);
  const [splashMinElapsed, setSplashMinElapsed] = useState(false);
  const [splashMaxElapsed, setSplashMaxElapsed] = useState(false);
  useAbandonStaleJudgeRequestsOnBootstrap(user?.id);

  const appReadyForRouting = !loading && !(passwordRecoveryPending && !user);

  useEffect(() => {
    const key = 'owe_it_session_logo_splash_seen_v1';
    if (window.sessionStorage.getItem(key) === '1') return;
    window.sessionStorage.setItem(key, '1');
    setShowSessionSplash(true);
    const minTimer = window.setTimeout(() => setSplashMinElapsed(true), 1000);
    const maxTimer = window.setTimeout(() => setSplashMaxElapsed(true), 3000);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, []);

  const shouldShowLogoSplash = useMemo(() => {
    if (!showSessionSplash) return false;
    if (!splashMinElapsed) return true; // Always show for first second.
    return !appReadyForRouting && !splashMaxElapsed; // Keep up to 3s while app is still loading.
  }, [showSessionSplash, splashMinElapsed, appReadyForRouting, splashMaxElapsed]);

  if (shouldShowLogoSplash) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <img
          src="/favicon-full.svg"
          alt="Owe It"
          className="block h-[18.2rem] w-[18.2rem] sm:h-[20.8rem] sm:w-[20.8rem] object-contain animate-pop-in"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (passwordRecoveryPending && !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  if (passwordRecoveryPending) {
    return <PasswordRecoveryScreen />;
  }

  return (
    <AppTutorialProvider
      createGoalOpen={createOpen}
      onRequestOpenCreateGoal={() => setCreateOpen(true)}
    >
      <LoggedInAppShell createOpen={createOpen} setCreateOpen={setCreateOpen} />
    </AppTutorialProvider>
  );
}

function LoggedInAppShell({
  createOpen,
  setCreateOpen,
}: {
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
}) {
  const { fabSpotlight, onFabPhaseCreateOpened, highlightNavTab } = useAppTutorial();
  const isFetching = useIsFetching();
  const [showShellSplash, setShowShellSplash] = useState(false);
  const [shellSplashMinElapsed, setShellSplashMinElapsed] = useState(false);
  const [shellSplashMaxElapsed, setShellSplashMaxElapsed] = useState(false);

  useEffect(() => {
    const key = 'owe_it_session_main_shell_logo_splash_seen_v1';
    if (window.sessionStorage.getItem(key) === '1') return;
    window.sessionStorage.setItem(key, '1');
    setShowShellSplash(true);
    const minTimer = window.setTimeout(() => setShellSplashMinElapsed(true), 1000);
    const maxTimer = window.setTimeout(() => setShellSplashMaxElapsed(true), 3000);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, []);

  const shouldShowShellSplash = useMemo(() => {
    if (!showShellSplash) return false;
    if (!shellSplashMinElapsed) return true; // Always show for first second.
    const shellStillLoading = isFetching > 0;
    return shellStillLoading && !shellSplashMaxElapsed; // Keep up to 3s while first shell data is loading.
  }, [showShellSplash, shellSplashMinElapsed, shellSplashMaxElapsed, isFetching]);

  if (shouldShowShellSplash) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <img
          src="/favicon-full.svg"
          alt="Owe It"
          className="block h-[18.2rem] w-[18.2rem] sm:h-[20.8rem] sm:w-[20.8rem] object-contain animate-pop-in"
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto relative">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pulse" element={<Pulse />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/my-judges" element={<MyJudges />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/admin-feedback" element={<AdminFeedback />} />
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <BottomNav
        fabTutorialSpotlight={fabSpotlight}
        highlightTab={highlightNavTab}
        tabTourBlocking={Boolean(highlightNavTab)}
        onCreateGoal={() => {
          if (fabSpotlight) onFabPhaseCreateOpened();
          else setCreateOpen(true);
        }}
      />
      <CreateGoalSheet open={createOpen} onClose={() => setCreateOpen(false)} />
      <AppTutorialChrome onCloseCreateSheet={() => setCreateOpen(false)} />
      <JudgeRequestToastHost />
      <JudgeGoalCreatedNoticeHost />
      <DeadlineReminderToastHost />
    </div>
  );
}

const App = () => {
  // Use hash routing in native WebViews to avoid "refresh on /pulse breaks" issues.
  const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppVersionQuote />
          <Router>
            <AppRoutes />
          </Router>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
