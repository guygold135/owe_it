import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useIsFetching } from "@tanstack/react-query";
import { Capacitor } from '@capacitor/core';
import { BrowserRouter, HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav } from "@/components/BottomNav";
import { AppTutorialChrome } from "@/components/AppTutorialChrome";
import { AppTutorialProvider, useAppTutorial } from "@/hooks/useAppTutorial";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useAbandonStaleJudgeRequestsOnBootstrap } from "@/hooks/useAbandonStaleJudgeRequestsOnBootstrap";
import { usePendingJudgeInviteRedirect } from "@/hooks/usePendingJudgeInviteRedirect";
import { JudgeRequestToastHost } from "@/components/JudgeRequestToastHost";
import { JudgeGoalCreatedNoticeHost } from "@/components/JudgeGoalCreatedNoticeHost";
import { JudgeAcceptedNoticeHost, useResumeGoalRequestListener } from "@/components/JudgeAcceptedNoticeHost";
import { DeadlineReminderToastHost } from "@/components/DeadlineReminderToastHost";
import { RetryPaymentModalHost } from "@/components/RetryPaymentModalHost";
import { FriendRequestToastHost } from "@/components/FriendRequestToastHost";
import { PasswordRecoveryScreen } from "@/components/PasswordRecoveryScreen";
import { APP_LOGO_SRC } from "@/lib/brandAssets";
import {
  clearResumeGoalRequestFromUrl,
  consumePendingGoalResume,
  resumeGoalRequestSearchParam,
} from '@/lib/pendingGoalResume';
import { supabase } from '@/integrations/supabase/client';

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

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Pulse = lazy(() => import("./pages/Pulse"));
const Friends = lazy(() => import("./pages/Friends"));
const Auth = lazy(() => import("./pages/Auth"));
const Settings = lazy(() => import("./pages/Settings"));
const History = lazy(() => import("./pages/History"));
const MyJudges = lazy(() => import("./pages/MyJudges"));
const Profile = lazy(() => import("./pages/Profile"));
const Help = lazy(() => import("./pages/Help"));
const FeedbackRouter = lazy(() => import("./pages/FeedbackRouter"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const JudgeInviteAccept = lazy(() => import("./pages/JudgeInviteAccept"));
const CreateGoalSheet = lazy(() =>
  import("@/components/CreateGoalSheet").then((mod) => ({ default: mod.CreateGoalSheet })),
);

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
        className="block h-36 w-36 sm:h-44 sm:w-44 overflow-hidden rounded-[28px] sm:rounded-[34px] object-cover drop-shadow-sm select-none"
        width={176}
        height={176}
        decoding="sync"
        loading="eager"
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

function RouteLoadingScreen() {
  // Used during in-app navigation when lazy-loaded routes are fetching.
  // Intentionally NOT the big logo loader.
  return (
    <div className="min-h-[calc(100vh-5rem)] flex flex-col justify-center px-6">
      <div className="max-w-sm mx-auto w-full space-y-4">
        <div className="h-28 rounded-[24px] bg-muted/50 animate-pulse border border-border/40" />
        <div className="h-10 rounded-[20px] bg-muted/40 animate-pulse border border-border/40" />
        <div className="h-24 rounded-[20px] bg-muted/50 animate-pulse border border-border/40" />
        <div className="h-24 rounded-[20px] bg-muted/50 animate-pulse border border-border/40" />
      </div>
    </div>
  );
}

const ROUTE_LOADING_BLANK_MS = 200;

/** Blank briefly so fast navigations never flash the skeleton; then skeleton if chunk still loading. */
function DelayedRouteFallback() {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setShowSkeleton(true), ROUTE_LOADING_BLANK_MS);
    return () => window.clearTimeout(id);
  }, []);

  if (!showSkeleton) {
    return <div className="min-h-[calc(100vh-5rem)] bg-background" aria-hidden />;
  }
  return <RouteLoadingScreen />;
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

  // Logo + loading bar on first paint whenever auth/bootstrap is not ready (matches index.html #boot-splash).
  if (shouldShowLogoSplash || !appReadyForRouting) {
    return <BootstrapLogoScreen />;
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto relative min-h-screen flex flex-col">
        <Suspense fallback={<BootstrapLogoScreen />}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/judge-invite/:requestId" element={<JudgeInviteAccept />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </Suspense>
      </div>
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
  const { user } = useAuth();
  const { phase, tutorialBootBlocking, fabSpotlight, onFabPhaseCreateOpened, highlightNavTab } = useAppTutorial();
  usePendingJudgeInviteRedirect();
  const [resumeJudgeRequestId, setResumeJudgeRequestId] = useState<string | null>(null);
  const isFetching = useIsFetching();
  const [showShellSplash, setShowShellSplash] = useState(() =>
    typeof window !== 'undefined' ? sessionStorage.getItem(SHELL_SPLASH_KEY) !== '1' : false,
  );
  const [shellSplashMinElapsed, setShellSplashMinElapsed] = useState(false);
  const [shellSplashMaxElapsed, setShellSplashMaxElapsed] = useState(false);

  const handleResumeHandled = useCallback(() => {
    setResumeJudgeRequestId(null);
  }, []);

  const openResumeGoalRequest = useCallback(
    (requestId: string) => {
      setResumeJudgeRequestId(requestId);
      setCreateOpen(true);
    },
    [setCreateOpen],
  );

  useResumeGoalRequestListener(openResumeGoalRequest);

  useEffect(() => {
    if (!user?.id) return;

    const fromUrl = resumeGoalRequestSearchParam();
    if (fromUrl) {
      openResumeGoalRequest(fromUrl);
      clearResumeGoalRequestFromUrl();
      return;
    }

    const pending = consumePendingGoalResume();
    if (!pending) return;

    void supabase
      .from('judge_requests')
      .select('id, status')
      .eq('id', pending)
      .eq('requester_user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status === 'accepted') {
          openResumeGoalRequest(pending);
        }
      });
  }, [user?.id, openResumeGoalRequest]);

  useEffect(() => {
    let cancelled = false;
    const preloadCreateSheet = () => {
      if (cancelled) return;
      void import('@/components/CreateGoalSheet');
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(
        preloadCreateSheet,
      );
      return () => {
        cancelled = true;
        if ('cancelIdleCallback' in window) {
          (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
        }
      };
    }

    const timer = window.setTimeout(preloadCreateSheet, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

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

  const shellStillLoading = isFetching > 0;
  const shouldShowShellSplash = useMemo(() => {
    if (!showShellSplash) return false;
    if (!shellSplashMinElapsed) return true; // Always show for first second.
    return shellStillLoading && !shellSplashMaxElapsed; // Keep up to 3s while first shell data is loading.
  }, [showShellSplash, shellSplashMinElapsed, shellSplashMaxElapsed, shellStillLoading]);

  if (shouldShowShellSplash) {
    return <BootstrapLogoScreen />;
  }

  const hideAppBehindWelcome = tutorialBootBlocking || phase === 'welcome';

  return (
    <div className="max-w-lg mx-auto relative">
      <div
        aria-hidden={hideAppBehindWelcome || undefined}
        className={hideAppBehindWelcome ? 'pointer-events-none select-none opacity-0' : undefined}
      >
        <Suspense fallback={<DelayedRouteFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pulse" element={<Pulse />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/my-judges" element={<MyJudges />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/help" element={<Help />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/feedback" element={<FeedbackRouter />} />
            <Route path="/judge-invite/:requestId" element={<JudgeInviteAccept />} />
            <Route path="/admin-feedback" element={<Navigate to="/feedback" replace />} />
            <Route path="/auth" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <BottomNav
          fabTutorialSpotlight={fabSpotlight}
          highlightTab={highlightNavTab}
          tabTourBlocking={Boolean(highlightNavTab)}
          onCreateGoal={() => {
            if (fabSpotlight) onFabPhaseCreateOpened();
            else setCreateOpen(true);
          }}
        />
        {createOpen ? (
          <Suspense fallback={<div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />}>
            <CreateGoalSheet
              open={createOpen}
              onClose={() => setCreateOpen(false)}
              resumeJudgeRequestId={resumeJudgeRequestId}
              onResumeHandled={handleResumeHandled}
            />
          </Suspense>
        ) : null}
      </div>
      <AppTutorialChrome onCloseCreateSheet={() => setCreateOpen(false)} />
      <FriendRequestToastHost />
      <JudgeRequestToastHost />
      <JudgeGoalCreatedNoticeHost />
      <JudgeAcceptedNoticeHost />
      <DeadlineReminderToastHost />
      <RetryPaymentModalHost />
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
          <Router>
            <AppRoutes />
          </Router>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
