import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { runJudgeInviteAutoAccept } from '@/lib/acceptJudgeInviteRequest';

/** After sign-in, auto-accept a judge invite from the email link. */
export function usePendingJudgeInviteRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user?.id) return;

    void runJudgeInviteAutoAccept({
      pathname: location.pathname,
      userId: user.id,
      userMetadata: null,
      allowMetadataFallback: false,
    }).then((ok) => {
      if (!ok) return;
      if (
        location.pathname.match(/\/judge-invite\//i) ||
        location.search.includes('judgeInviteRequestId')
      ) {
        navigate('/', { replace: true });
      }
    });
  }, [user?.id, loading, location.pathname, location.search, navigate]);
}
