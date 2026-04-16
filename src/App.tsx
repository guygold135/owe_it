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
import { FriendRequestToastHost } from "@/components/FriendRequestToastHost";
import { AppVersionQuote } from "@/components/AppVersionQuote";
import { PasswordRecoveryScreen } from "@/components/PasswordRecoveryScreen";
import { APP_LOGO_SRC } from "@/lib/brandAssets";

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

function BootstrapLogoScreen() {
  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6"
      aria-busy="true"
      aria-live="polite"
    >
      <img
        src={APP_LOGO_SRC}
        alt=""
        aria-hidden
        className="block h-36 w-36 sm:h-44 sm:w-44 object-contain"
        decoding="sync"
        fetchPriority="high"
      />
      <div className="loading-track" aria-hidden>
        <div className="loading-bar" />
      </div>
      <p className="text-xs font-medium tracking-widest text-muted-foreground/60 uppercase">
        Loading
      </p>
    </div>
  );
}

const SESSION_SPLASH_KEY = 'owe_it_session_logo_splash_seen_v1';

function AppRoutes() {
  const { user, loading, passwordRecoveryPending } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  /** First visit in this tab: true immediately so we never flash another UI before the logo (see timers in effect). */
  const [showSessionSplash, setShowSessionSplash] = useState(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_SPLASH_KEY) !== '1' : false,
  );
  const [splashMinElapsed, setSplashMinElapsed] = useState(false);
  const [splashMaxElapsed, setSplashMaxElapsed] = useState(false);
  useAbandonStaleJudgeRequestsOnBootstrap(user?.id);

  const appReadyForRouting = !loading && !(passwordRecoveryPending && !user);

  useEffect(() => {
    if (!showSessionSplash) return;
    sessionStorage.setItem(SESSION_SPLASH_KEY, '1');
    const minTimer = window.setTimeout(() => setSplashMinElapsed(true), 1000);
    const maxTimer = window.setTimeout(() => setSplashMaxElapsed(true), 3000);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, [showSessionSplash]);

  const shouldShowLogoSplash = useMemo(() => {
    if (!showSessionSplash) return false;
    if (!splashMinElapsed) return true; // Always show for first second.
    return !appReadyForRouting && !splashMaxElapsed; // Keep up to 3s while app is still loading.
  }, [showSessionSplash, splashMinElapsed, appReadyForRouting, splashMaxElapsed]);

  if (shouldShowLogoSplash) {
    return <BootstrapLogoScreen />;
  }

  // Session splash is one-time per tab; still show the branded logo (not a spinner) while auth resolves.
  if (loading) {
    return <BootstrapLogoScreen />;
  }

  if (passwordRecoveryPending && !user) {
    return <BootstrapLogoScreen />;
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

const SHELL_SPLASH_KEY = 'owe_it_session_main_shell_logo_splash_seen_v1';

function LoggedInAppShell({
  createOpen,
  setCreateOpen,
}: {
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
}) {
  const { fabSpotlight, onFabPhaseCreateOpened, highlightNavTab } = useAppTutorial();
  const isFetching = useIsFetching();
  const [showShellSplash, setShowShellSplash] = useState(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem(SHELL_SPLASH_KEY) !== '1' : false,
  );
  const [shellSplashMinElapsed, setShellSplashMinElapsed] = useState(false);
  const [shellSplashMaxElapsed, setShellSplashMaxElapsed] = useState(false);

  useEffect(() => {
    if (!showShellSplash) return;
    sessionStorage.setItem(SHELL_SPLASH_KEY, '1');
    const minTimer = window.setTimeout(() => setShellSplashMinElapsed(true), 1000);
    const maxTimer = window.setTimeout(() => setShellSplashMaxElapsed(true), 3000);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, [showShellSplash]);

  const shouldShowShellSplash = useMemo(() => {
    if (!showShellSplash) return false;
    if (!shellSplashMinElapsed) return true; // Always show for first second.
    const shellStillLoading = isFetching > 0;
    return shellStillLoading && !shellSplashMaxElapsed; // Keep up to 3s while first shell data is loading.
  }, [showShellSplash, shellSplashMinElapsed, shellSplashMaxElapsed, isFetching]);

  if (shouldShowShellSplash) {
    return <BootstrapLogoScreen />;
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
      <FriendRequestToastHost />
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
