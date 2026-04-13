import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { consumeAuthRedirectError } from '@/lib/sessionBootstrap';

export default function Auth() {
  const { signIn, signUp, signInWithOAuth, sendPasswordResetEmail, resendSignupConfirmation } =
    useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [emailPendingConfirmation, setEmailPendingConfirmation] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<'google' | 'apple' | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const outcome = await signUp(email, password, displayName);
        if (outcome === 'confirm_email') {
          toast.success('Check your email to confirm your account, then sign in here.');
          setMode('signin');
          setEmailPendingConfirmation(email.trim());
        } else if (outcome === 'repeat_signup') {
          setMode('signin');
          setEmailPendingConfirmation(email.trim());
          toast.info(
            'This email is already registered. A second signup does not send another email. Sign in below, or use “Resend confirmation email” if you still need to verify.',
            { duration: 8000 },
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

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setOauthLoadingProvider(provider);
    try {
      await signInWithOAuth(provider);
    } catch (error: any) {
      toast.error(error?.message ?? `Could not continue with ${provider}.`);
      setOauthLoadingProvider(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      {/* Logo & Tagline */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="w-28 h-28 mx-auto mb-6 flex items-center justify-center">
          <img src="/app-logo.svg" alt="" className="h-full w-full object-contain drop-shadow-sm" width={112} height={112} decoding="async" />
        </div>
        <h1 className="text-4xl font-display font-extrabold text-foreground tracking-tight">
          Owe It
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Put your money where your ambition is.
        </p>
      </motion.div>

      {/* Auth Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="w-full max-w-sm"
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
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-card border-border rounded-2xl h-12 px-4"
                  required
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
          <span className="text-xs text-muted-foreground">or continue with</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-2xl text-sm font-medium"
            disabled={oauthLoadingProvider !== null}
            onClick={() => void handleOAuth('google')}
          >
            {oauthLoadingProvider === 'google' ? 'Connecting to Google...' : 'Continue with Google'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 rounded-2xl text-sm font-medium"
            disabled={oauthLoadingProvider !== null}
            onClick={() => void handleOAuth('apple')}
          >
            {oauthLoadingProvider === 'apple' ? 'Connecting to Apple...' : 'Continue with Apple'}
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
  );
}
