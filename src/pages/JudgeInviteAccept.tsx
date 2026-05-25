import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ensureJudgeInviteAccepted } from '@/lib/acceptJudgeInviteRequest';
import { storePendingJudgeAccept, urlHasAuthCallbackHash } from '@/lib/judgeRequestEmailAccept';
import { APP_LOGO_SRC } from '@/lib/brandAssets';

type Phase = 'waiting-auth' | 'accepting' | 'done' | 'error';

export default function JudgeInviteAccept() {
  const { requestId } = useParams<{ requestId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('waiting-auth');
  const [errorMessage, setErrorMessage] = useState('');
  const acceptStartedRef = useRef(false);

  useEffect(() => {
    if (!requestId?.trim()) {
      setPhase('error');
      setErrorMessage('This invite link is invalid.');
      return;
    }
    if (loading || (!user && urlHasAuthCallbackHash())) return;

    if (!user) {
      storePendingJudgeAccept(requestId);
      navigate('/auth', { replace: true });
      return;
    }

    if (acceptStartedRef.current) return;
    acceptStartedRef.current = true;
    setPhase('accepting');

    void ensureJudgeInviteAccepted(requestId).then((ok) => {
      if (!ok) {
        setPhase('error');
        setErrorMessage('Could not accept this judge request.');
        acceptStartedRef.current = false;
        return;
      }
      setPhase('done');
      window.setTimeout(() => navigate('/', { replace: true }), 1200);
    });
  }, [requestId, user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
      <img
        src={APP_LOGO_SRC}
        alt=""
        aria-hidden
        className="block h-24 w-24 overflow-hidden rounded-[24px] object-cover"
        width={96}
        height={96}
      />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
        <Users className="h-5 w-5 text-emerald-400" />
      </div>
      {phase === 'waiting-auth' || phase === 'accepting' ? (
        <>
          <p className="font-display font-semibold text-foreground">Accepting judge invite…</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            {phase === 'waiting-auth'
              ? 'Checking your sign-in status.'
              : 'Confirming your acceptance now.'}
          </p>
        </>
      ) : null}
      {phase === 'done' ? (
        <>
          <p className="font-display font-semibold text-foreground">You&apos;re the judge</p>
          <p className="text-sm text-muted-foreground max-w-sm">Taking you to your dashboard…</p>
        </>
      ) : null}
      {phase === 'error' ? (
        <>
          <p className="font-display font-semibold text-destructive">Could not accept invite</p>
          <p className="text-sm text-muted-foreground max-w-sm">{errorMessage}</p>
          <button
            type="button"
            onClick={() => navigate(user ? '/' : '/auth', { replace: true })}
            className="mt-2 rounded-2xl bg-muted px-5 py-3 text-sm font-display font-semibold text-foreground"
          >
            {user ? 'Go to dashboard' : 'Sign in'}
          </button>
        </>
      ) : null}
    </div>
  );
}
