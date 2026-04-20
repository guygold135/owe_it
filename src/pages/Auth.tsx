import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { consumeAuthRedirectError } from '@/lib/sessionBootstrap';
import { APP_LOGO_SRC } from '@/lib/brandAssets';
import { isElevenDigitDisplayName } from '@/lib/displayName';
import { SmokeBackground } from '@/components/ui/spooky-smoke-animation';

function GoogleLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#4285F4"
        d="M21.805 12.23c0-.68-.055-1.364-.172-2.033H12.24v3.851h5.38a4.6 4.6 0 0 1-1.993 3.022v2.499h3.22c1.89-1.74 2.958-4.31 2.958-7.339Z"
      />
      <path
        fill="#34A853"
        d="M12.24 21.96c2.687 0 4.953-.882 6.604-2.391l-3.22-2.499c-.896.61-2.052.955-3.384.955-2.6 0-4.803-1.754-5.589-4.113H3.329v2.576c1.69 3.363 5.133 5.472 8.911 5.472Z"
      />
      <path
        fill="#FBBC05"
        d="M6.651 13.912a5.79 5.79 0 0 1 0-3.701V7.635H3.329a9.72 9.72 0 0 0 0 8.853l3.322-2.576Z"
      />
      <path
        fill="#EA4335"
        d="M12.24 6.098c1.457 0 2.764.501 3.793 1.484l2.826-2.826c-1.717-1.599-3.983-2.59-6.619-2.59-3.778 0-7.221 2.11-8.911 5.47l3.322 2.577c.786-2.36 2.988-4.115 5.589-4.115Z"
      />
    </svg>
  );
}

export default function Auth() {
  const { signIn, signUp, signInWithOAuth, sendPasswordResetEmail, resendSignupConfirmation } =
    useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [emailPendingConfirmation, setEmailPendingConfirmation] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<'google' | null>(null);
  const [resetSending, setResetSending] = useState(false);
  const [resendConfirmBusy, setResendConfirmBusy] = useState(false);

  useEffect(() => {
    const redirectErr = consumeAuthRedirectError();
    if (redirectErr) {
      const desc = redirectErr.errorDescription
        ? decodeURIComponent(redirectErr.errorDescription.replace(/\+/g, ' '))
        : '';
      if (redirectErr.errorCode === 'otp_expired') {
        toast.error(
          'That reset link has expired or was already used. Request a new password reset below.',
        );
      } else {
        toast.error(desc || 'This sign-in link is invalid. Try again or request a new email.');
      }
    }
    if (typeof window !== 'undefined' && window.location.hash.includes('error=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  /** Catches autofill / DOM–React drift: state must never stay as exactly 11 digits. */
  useLayoutEffect(() => {
    if (!isElevenDigitDisplayName(displayName)) return;
    setDisplayName((d) => (d.length > 0 ? d.slice(0, -1) : ''));
    toast.error(
      'Display name cannot be exactly 11 digits (reserved). Add a letter or use a different length.',
      { id: 'display-name-eleven-digits' },
    );
  }, [displayName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawDisplayName =
      mode === 'signup' && displayNameInputRef.current
        ? displayNameInputRef.current.value
        : displayName;
    const signupName = String(rawDisplayName).trim();
    if (mode === 'signup' && isElevenDigitDisplayName(signupName)) {
      toast.error(
        'Display name cannot be exactly 11 digits (reserved). Add a letter or use a different length.',
      );
      setDisplayName(signupName.length > 0 ? signupName.slice(0, -1) : '');
      return;
    }
    if (mode === 'signup') {
      setDisplayName(signupName);
    }
    setLoading(true);

    try {
      if (mode === 'signup') {
        const outcome = await signUp(email, password, signupName);
        if (outcome === 'confirm_email') {
          toast.success('Check your email to confirm your account, then sign in here.');
          setMode('signin');
          setEmailPendingConfirmation(email.trim());
        } else if (outcome === 'repeat_signup') {
          setMode('signin');
          setEmailPendingConfirmation(email.trim());
          toast.info(
            <>
              This email is already registered.
              <br />
              Try the <span className="font-semibold text-primary">Forgot password?</span> button if you
              can't remember the password.
            </>,
            {
              duration: 8000,
            },
          );
        } else {
          setEmailPendingConfirmation(null);
          toast.success('Account created and signed in!');
        }
      } else {
        await signIn(email, password);
        setEmailPendingConfirmation(null);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Enter your email address first.');
      return;
    }
    setResetSending(true);
    try {
      await sendPasswordResetEmail(trimmed);
      toast.success('Check your email for a link to reset your password.');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not send reset email.');
    } finally {
      setResetSending(false);
    }
  };

  const handleResendConfirmation = async () => {
    const target = emailPendingConfirmation ?? email.trim();
    if (!target) {
      toast.error('Enter the email you used to sign up.');
      return;
    }
    setResendConfirmBusy(true);
    try {
      await resendSignupConfirmation(target);
      toast.success('Sent again. Check spam and promotions folders.');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not resend the email.');
    } finally {
      setResendConfirmBusy(false);
    }
  };

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (isElevenDigitDisplayName(next)) {
      toast.error(
        'Display name cannot be exactly 11 digits (reserved). Add a letter or use a different length.',
        { id: 'display-name-eleven-digits' },
      );
      setDisplayName(next.length > 0 ? next.slice(0, -1) : '');
      return;
    }
    setDisplayName(next);
  };

  const handleDisplayNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (isElevenDigitDisplayName(v)) {
      toast.error(
        'Display name cannot be exactly 11 digits (reserved). Add a letter or use a different length.',
        { id: 'display-name-eleven-digits' },
      );
      v = v.slice(0, -1);
    }
    setDisplayName(v);
  };

  const handleOAuth = async (provider: 'google') => {
    setOauthLoadingProvider(provider);
    try {
      await signInWithOAuth(provider);
    } catch (error: any) {
      toast.error(error?.message ?? `Could not continue with ${provider}.`);
      setOauthLoadingProvider(null);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-10">
      <SmokeBackground smokeColor="#30e07a" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-sm flex-col items-center justify-center">
        {/* Logo & Tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="mb-10 text-center"
        >
          <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-[28px] bg-card/55 p-3 backdrop-blur-md">
            <img
              src={APP_LOGO_SRC}
              alt=""
              className="h-full w-full object-contain drop-shadow-sm select-none"
              width={72}
              height={72}
              decoding="async"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <h1 className="text-4xl font-display font-extrabold tracking-tight text-foreground">
            Owe It
          </h1>
          <p className="mt-2 text-sm font-medium text-foreground/85">
            Win for yourself or give for a cause.
            <br />
            Either way, something good happens.
          </p>
        </motion.div>

        {/* Auth Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="w-full rounded-[32px] border border-border/70 bg-card/78 p-5 shadow-2xl backdrop-blur-xl"
        >
        {/* Mode Toggle */}
        <div className="flex rounded-2xl bg-card border border-border p-1 mb-8">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            {mode === 'signup' && (
              <motion.div
                key="name"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Input
                  ref={displayNameInputRef}
                  placeholder="Display name"
                  value={displayName}
                  onChange={handleDisplayNameChange}
                  onBlur={handleDisplayNameBlur}
                  className="bg-card border-border rounded-2xl h-12 px-4"
                  autoComplete="nickname"
                  minLength={1}
                  required
                  inputMode="text"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-card border-border rounded-2xl h-12 px-4"
            required
          />

          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-card border-border rounded-2xl h-12 px-4 pr-12"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {mode === 'signin' && (
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                disabled={resetSending}
                className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
              >
                {resetSending ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-2xl text-sm font-semibold glow-primary gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>

        {emailPendingConfirmation && mode === 'signin' && (
          <div className="mt-4 rounded-2xl border border-border bg-card/50 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground mb-2">
              Check spam or promotions. Still nothing? Resend below.
            </p>
            <button
              type="button"
              onClick={() => void handleResendConfirmation()}
              disabled={resendConfirmBusy}
              className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
            >
              {resendConfirmBusy ? 'Sending…' : 'Resend confirmation email'}
            </button>
          </div>
        )}

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-base font-semibold text-foreground/70">or continue with</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-2xl text-base font-semibold"
            disabled={oauthLoadingProvider !== null}
            onClick={() => void handleOAuth('google')}
          >
            <GoogleLogo />
            {oauthLoadingProvider === 'google' ? 'Connecting...' : 'Google'}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          {mode === 'signin'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-primary font-medium hover:underline"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
        </motion.div>
      </div>
    </div>
  );
}
