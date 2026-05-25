import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  captureJudgeInviteFromUrl,
  consumePendingJudgeAccept,
  clearJudgeInviteRequestFromUrl,
} from '@/lib/judgeRequestEmailAccept';

/** After sign-in, resume a judge invite stored from the email link. */
export function usePendingJudgeInviteRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    captureJudgeInviteFromUrl();
    if (loading || !user?.id) return;

    if (location.pathname.match(/\/judge-invite\/[^/]+/i)) return;

    const pending = consumePendingJudgeAccept();
    if (!pending) return;
    clearJudgeInviteRequestFromUrl();
    navigate(`/judge-invite/${pending}`, { replace: true });
  }, [user?.id, loading, navigate, location.pathname]);
}
