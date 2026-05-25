import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { consumePendingJudgeAccept, clearJudgeInviteRequestFromUrl } from '@/lib/judgeRequestEmailAccept';

/** After sign-in, resume a judge invite stored while the user was logged out. */
export function usePendingJudgeInviteRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user?.id) return;
    const pending = consumePendingJudgeAccept();
    if (!pending) return;
    clearJudgeInviteRequestFromUrl();
    navigate(`/judge-invite/${pending}`, { replace: true });
  }, [user?.id, loading, navigate]);
}
