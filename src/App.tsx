import { useState } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from '@capacitor/core';
import { BrowserRouter, HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav } from "@/components/BottomNav";
import { CreateGoalSheet } from "@/components/CreateGoalSheet";
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
  useAbandonStaleJudgeRequestsOnBootstrap(user?.id);

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
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <BottomNav onCreateGoal={() => setCreateOpen(true)} />
      <CreateGoalSheet open={createOpen} onClose={() => setCreateOpen(false)} />
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
