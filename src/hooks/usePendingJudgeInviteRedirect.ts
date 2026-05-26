import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { runJudgeInviteAutoAccept } from '@/lib/acceptJudgeInviteRequest';
import { peekJudgeEmailFlow, peekMagicLinkAuthPending } from '@/lib/judgeRequestEmailAccept';

function hasEmailLinkIntent(pathname: string, search: string): boolean {
  return (
    pathname.includes('/judge-invite/') ||
    search.includes('judgeInviteRequestId') ||
    peekJudgeEmailFlow() ||
    peekMagicLinkAuthPending()
  );
}

/** Auto-accept when the judge opened the email link while already signed in. */
export function usePendingJudgeInviteRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user?.id) return;
    if (!hasEmailLinkIntent(location.pathname, location.search)) return;

    void runJudgeInviteAutoAccept({
      pathname: location.pathname,
      userMetadata: null,
      allowMagicLinkMetadata: false,
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
