import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  ensureJudgeInviteAccepted,
  primeJudgeInviteFromUrl,
  resolveJudgeInviteRequestId,
} from '@/lib/acceptJudgeInviteRequest';

/**
 * After sign-in, auto-accept a judge invite from the email link.
 * Accepts directly (no route mount required) so bootstrap splash cannot block it.
 */
export function usePendingJudgeInviteRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const lastAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    primeJudgeInviteFromUrl();
    if (loading || !user?.id) return;

    const requestId = resolveJudgeInviteRequestId(location.pathname);
    if (!requestId || lastAttemptRef.current === requestId) return;

    lastAttemptRef.current = requestId;
    void ensureJudgeInviteAccepted(requestId).then((ok) => {
      if (!ok) {
        lastAttemptRef.current = null;
        return;
      }
      if (
        location.pathname.match(/\/judge-invite\//i) ||
        location.search.includes('judgeInviteRequestId')
      ) {
        navigate('/', { replace: true });
      }
    });
  }, [user?.id, loading, location.pathname, location.search, navigate]);
}
