import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DropIn, { type Dropin } from 'braintree-web-drop-in-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { HoldToConfirmButton } from '@/components/ui/hold-to-confirm-button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_STAKE_CURRENCIES, formatStakeAmount, formatStakeCurrencyLabel, type StakeCurrency } from '@/lib/currency';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { useGoals } from '@/hooks/useGoals';
import { useGoalsAsJudge } from '@/hooks/useGoalsAsJudge';
import UserProfilePopover from '@/components/UserProfilePopover';
import { queryKeys } from '@/lib/queryKeys';

function resolveTransactionCurrencies(): StakeCurrency[] {
  const raw = (import.meta.env.VITE_ALLOWED_STAKE_CURRENCIES as string | undefined)?.trim();
  if (!raw) return ['ils', 'usd'];
  const parsed = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is StakeCurrency =>
      SUPPORTED_STAKE_CURRENCIES.includes(value as StakeCurrency),
    );
  return parsed.length > 0 ? Array.from(new Set(parsed)) : ['ils', 'usd'];
}

async function getInvokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object') {
    const maybeContext = (error as { context?: Response | { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
    if (maybeContext && typeof maybeContext === 'object' && 'json' in maybeContext && typeof maybeContext.json === 'function') {
      try {
        const payload = (await maybeContext.json()) as {
          error?: unknown;
          debug?: { provider?: unknown; environment?: unknown; currency?: unknown; merchantAccountId?: unknown };
        };
        if (typeof payload.error === 'string' && payload.error.trim()) {
          const debug = payload.debug;
          if (debug && typeof debug === 'object') {
            const provider = typeof debug.provider === 'string' ? debug.provider : 'provider';
            const environment = typeof debug.environment === 'string' ? debug.environment : 'unknown';
            const currency = typeof debug.currency === 'string' ? debug.currency : 'unknown';
            const merchantAccountId =
              typeof debug.merchantAccountId === 'string' && debug.merchantAccountId.trim()
                ? debug.merchantAccountId
                : 'none';
            return `${payload.error.trim()} (${provider} env=${environment} currency=${currency} merchant=${merchantAccountId})`;
          }
          return payload.error.trim();
        }
      } catch {
        try {
          if ('text' in maybeContext && typeof maybeContext.text === 'function') {
            const text = await maybeContext.text();
            if (text.trim()) return text.trim();
          }
        } catch {
          // ignore
        }
      }
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return fallback;
}

async function getGoalLastPaymentError(goalId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('goals')
    .select('last_payment_error')
    .eq('id', goalId)
    .maybeSingle();
  if (error) return null;
  const message = (data as { last_payment_error?: unknown } | null)?.last_payment_error;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return null;
}

function RetryPaymentCardForm({
  goalId,
  onSuccess,
}: {
  goalId: string;
  onSuccess: () => void;
}) {
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [dropinInstance, setDropinInstance] = useState<Dropin | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingToken(true);
    setTokenError(null);
    setDropinInstance(null);
    void supabase.functions.invoke('create-braintree-client-token', { body: {} })
      .then(({ data, error }) => {
        if (error) throw error;
        const token = (data as { clientToken?: unknown } | null)?.clientToken;
        if (typeof token !== 'string' || !token) throw new Error('Missing Braintree client token');
        if (!cancelled) setClientToken(token);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not initialize payment form.';
        setTokenError(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingToken(false);
      });
    return () => {
      cancelled = true;
      setDropinInstance(null);
    };
  }, [goalId]);

  const submit = async () => {
    if (!dropinInstance || submitting) return;
    setSubmitting(true);
    try {
      const method = await dropinInstance.requestPaymentMethod();
      const nonce = method?.nonce;
      if (!nonce) return toast.error('Please enter card details first.');

      const { data, error: invokeError } = await supabase.functions.invoke('retry-failed-goal-payment', {
        body: { goalId, paymentMethodNonce: nonce },
      });
      if (invokeError) {
        let message = await getInvokeErrorMessage(invokeError, 'Could not complete the donation transfer.');
        if (message.toLowerCase().includes('non-2xx status code')) {
          const lastPaymentError = await getGoalLastPaymentError(goalId);
          if (lastPaymentError) message = lastPaymentError;
        }
        toast.error(message);
        return;
      }
      if (data?.success === false) {
        const fallback = await getGoalLastPaymentError(goalId);
        toast.error(data?.error ?? fallback ?? 'Could not complete the donation transfer.');
        return;
      }
      toast.success('Stake donation completed successfully.');
      onSuccess();
    } catch (err: unknown) {
      toast.error(await getInvokeErrorMessage(err, 'Could not complete payment retry.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <style>{`
        .retry-braintree .braintree-dropin,
        .retry-braintree .braintree-dropin * {
          color: hsl(var(--foreground)) !important;
          border-color: hsl(var(--border)) !important;
        }
        .retry-braintree,
        .retry-braintree:focus,
        .retry-braintree:focus-within,
        .retry-braintree .braintree-dropin,
        .retry-braintree .braintree-dropin:focus,
        .retry-braintree .braintree-dropin:focus-within {
          outline: none !important;
          box-shadow: none !important;
        }
        .retry-braintree .braintree-dropin,
        .retry-braintree .braintree-dropin-wrapper,
        .retry-braintree [id^="braintree--dropin__"] {
          background: hsl(var(--background)) !important;
          border-radius: 16px !important;
          overflow: hidden !important;
        }
        .retry-braintree .braintree-dropin .braintree-upper-container,
        .retry-braintree .braintree-dropin .braintree-sheet__container,
        .retry-braintree .braintree-dropin .braintree-sheet,
        .retry-braintree .braintree-dropin .braintree-sheet__header,
        .retry-braintree .braintree-dropin .braintree-sheet__content,
        .retry-braintree .braintree-dropin .braintree-sheet__content--form {
          background: hsl(var(--background)) !important;
        }
        .retry-braintree .braintree-dropin .braintree-upper-container,
        .retry-braintree .braintree-dropin .braintree-sheet__container,
        .retry-braintree .braintree-dropin .braintree-card,
        .retry-braintree .braintree-dropin .braintree-sheet {
          border-radius: 16px !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        .retry-braintree .braintree-dropin .braintree-sheet__header {
          border-bottom: 1px solid hsl(var(--border)) !important;
          border-radius: 0 !important;
        }
        .retry-braintree .braintree-dropin .braintree-sheet__content,
        .retry-braintree .braintree-dropin .braintree-sheet__content--form {
          border-radius: 0 !important;
          background: hsl(var(--muted)) !important;
        }
        .retry-braintree .braintree-dropin .braintree-form__field-group,
        .retry-braintree .braintree-dropin .braintree-form__field {
          background: hsl(var(--muted)) !important;
          border: 0 !important;
          outline: 0 !important;
          border-radius: 12px !important;
          box-shadow: none !important;
        }
        .retry-braintree .braintree-dropin .braintree-form__field-group:focus-within,
        .retry-braintree .braintree-dropin [data-braintree-id="cardholder-name-field-group"],
        .retry-braintree .braintree-dropin [data-braintree-id="number-field-group"],
        .retry-braintree .braintree-dropin [data-braintree-id="expiration-date-field-group"] {
          background: hsl(var(--muted)) !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
        .retry-braintree .braintree-dropin .braintree-form__flexible-fields,
        .retry-braintree .braintree-dropin .braintree-form__flexible-field {
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        .retry-braintree .braintree-dropin .braintree-placeholder,
        .retry-braintree .braintree-dropin .braintree-form__label {
          color: hsl(var(--muted-foreground)) !important;
        }
        .retry-braintree .braintree-dropin .braintree-lower-container,
        .retry-braintree .braintree-dropin [data-braintree-id="lower-container"],
        .retry-braintree .braintree-dropin .braintree-loader__container,
        .retry-braintree .braintree-dropin [data-braintree-id="loading-container"] {
          display: none !important;
        }
      `}</style>
      <div className="retry-braintree relative min-h-[180px]">
        {loadingToken && <p className="text-xs text-muted-foreground">Loading secure card form…</p>}
        {tokenError && <p className="text-xs text-destructive">{tokenError}</p>}
        {clientToken && (
          <DropIn
            options={{
              authorization: clientToken,
              preselectVaultedPaymentMethod: false,
              card: { cardholderName: true },
              paypal: false,
            }}
            onInstance={(instance) => {
              setDropinInstance(instance);
              // Force fresh card entry instead of silently reusing an old vaulted selection.
              try {
                instance.clearSelectedPaymentMethod();
              } catch {
                // ignore
              }
            }}
          />
        )}
      </div>
      <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground/80">
        HOLD TO ACCEPT
      </p>
      <HoldToConfirmButton
        variant="default"
        className="w-full min-h-[56px] rounded-2xl glow-primary font-display text-base font-bold"
        disabled={!dropinInstance || loadingToken || !!tokenError || submitting}
        idleLabel={submitting ? 'Donating…' : 'Update card and donate now'}
        holdingLabel="Sure?"
        onConfirm={() => void submit()}
      />
    </div>
  );
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { goals } = useGoals();
  const { goals: judgeGoals, loading: judgeGoalsLoading } = useGoalsAsJudge();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { currency, setCurrency } = useStakeCurrencyPreference();
  const [currencySearch, setCurrencySearch] = useState('');
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const currencyPickerRef = useRef<HTMLDivElement | null>(null);
  const [failedPaymentGoals, setFailedPaymentGoals] = useState<Array<{ id: string; title: string; stake: number }>>([]);
  const [retryGoalId, setRetryGoalId] = useState<string | null>(null);
  const [retryWindowGoalId, setRetryWindowGoalId] = useState<string | null>(null);
  const [retryWindowOpen, setRetryWindowOpen] = useState(false);
  const [retryToastContext, setRetryToastContext] = useState<{
    notificationId: string | null;
    goalId: string | null;
    kind: string | null;
    title: string | null;
  } | null>(null);
  const retryPaidRef = useRef(false);
  const transactionCurrencies = useMemo(() => resolveTransactionCurrencies(), []);

  useEffect(() => {
    if (!transactionCurrencies.includes(currency)) {
      setCurrency(transactionCurrencies[0]);
      return;
    }
    setCurrencySearch(formatStakeCurrencyLabel(currency));
  }, [currency, transactionCurrencies, setCurrency]);

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return transactionCurrencies;
    return transactionCurrencies.filter((code) => {
      const label = formatStakeCurrencyLabel(code).toLowerCase();
      return label.includes(q) || code.toLowerCase().includes(q);
    });
  }, [currencySearch, transactionCurrencies]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!currencyPickerRef.current) return;
      if (!currencyPickerRef.current.contains(event.target as Node)) {
        setCurrencyPickerOpen(false);
        setCurrencySearch(formatStakeCurrencyLabel(currency));
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [currency]);

  const activeStakesGoals = useMemo(
    () => goals.filter((g) => g.status === 'active' && g.stake > 0),
    [goals],
  );
  const activeStakesCount = activeStakesGoals.length;

  const activeStakedJudgeCommitments = useMemo(
    () =>
      judgeGoals.filter(
        (g) => g.status === 'active' && g.stake > 0 && user?.id != null && g.creatorId !== user.id,
      ),
    [judgeGoals, user?.id],
  );
  const activeStakedJudgeCommitmentCount = activeStakedJudgeCommitments.length;
  const accountDeletionBlockedByJudgeRole = judgeGoalsLoading || activeStakedJudgeCommitmentCount > 0;
  const accountDeletionBlockedByOwnStakedGoals = activeStakesCount > 0;
  const accountDeletionBlocked =
    accountDeletionBlockedByJudgeRole || accountDeletionBlockedByOwnStakedGoals;

  useEffect(() => {
    if (!user?.id) {
      setFailedPaymentGoals([]);
      return;
    }
    void supabase
      .from('goals')
      .select('id,title,stake')
      .eq('user_id', user.id)
      .eq('status', 'failed')
      .eq('payment_status', 'payment_failed')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) return;
        setFailedPaymentGoals(
          (data ?? []).map((row: { id: string; title: string | null; stake: number | null }) => ({
            id: String(row.id),
            title: String(row.title ?? 'Goal'),
            stake: Number(row.stake ?? 0),
          })),
        );
      });
  }, [user?.id, loading]);

  useEffect(() => {
    const onOpenRetryWindow = (event: Event) => {
      const customEvent = event as CustomEvent<{
        notificationId?: string | null;
        goalId?: string | null;
        kind?: string | null;
        title?: string | null;
      }>;
      const requestedGoalId = customEvent.detail?.goalId ?? null;
      if (!requestedGoalId) return;
      setRetryToastContext({
        notificationId: customEvent.detail?.notificationId ?? null,
        goalId: requestedGoalId,
        kind: customEvent.detail?.kind ?? null,
        title: customEvent.detail?.title ?? null,
      });
      retryPaidRef.current = false;
      const existingGoal = failedPaymentGoals.find((goal) => goal.id === requestedGoalId);
      if (existingGoal) {
        setRetryWindowGoalId(requestedGoalId);
        setRetryGoalId(requestedGoalId);
        setRetryWindowOpen(true);
        return;
      }

      void supabase
        .from('goals')
        .select('id,title,stake')
        .eq('id', requestedGoalId)
        .eq('user_id', user?.id ?? '')
        .eq('status', 'failed')
        .eq('payment_status', 'payment_failed')
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) {
            toast.error('Could not open card fix window for this alert.');
            return;
          }
          const row = data as { id: string; title: string | null; stake: number | null };
          const fetchedGoal = {
            id: String(row.id),
            title: String(row.title ?? 'Goal'),
            stake: Number(row.stake ?? 0),
          };
          setFailedPaymentGoals((prev) => {
            if (prev.some((goal) => goal.id === fetchedGoal.id)) return prev;
            return [fetchedGoal, ...prev];
          });
          setRetryWindowGoalId(fetchedGoal.id);
          setRetryGoalId(fetchedGoal.id);
          setRetryWindowOpen(true);
        });
    };

    window.addEventListener('open-retry-payment-window', onOpenRetryWindow as EventListener);
    return () => {
      window.removeEventListener('open-retry-payment-window', onOpenRetryWindow as EventListener);
    };
  }, [failedPaymentGoals, user?.id]);

  const retryWindowGoal = useMemo(
    () => failedPaymentGoals.find((goal) => goal.id === retryWindowGoalId) ?? null,
    [failedPaymentGoals, retryWindowGoalId],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (retryWindowOpen) {
      root.style.setProperty('--oweit-sonner-z', '110');
      return () => {
        root.style.removeProperty('--oweit-sonner-z');
      };
    }
    root.style.removeProperty('--oweit-sonner-z');
    return () => {
      root.style.removeProperty('--oweit-sonner-z');
    };
  }, [retryWindowOpen]);

  const closeRetryWindow = (open: boolean) => {
    setRetryWindowOpen(open);
    if (open) return;
    if (!retryPaidRef.current && retryToastContext?.notificationId) {
      window.dispatchEvent(
        new CustomEvent('retry-payment-window-cancelled', {
          detail: retryToastContext,
        }),
      );
    } else if (retryPaidRef.current) {
      try {
        window.sessionStorage.removeItem('pending_retry_payment_toast_payload');
      } catch {
        // Ignore storage failures.
      }
    }
    setRetryWindowGoalId(null);
    setRetryGoalId(null);
    setRetryToastContext(null);
    retryPaidRef.current = false;
  };

  const confirmDeleteAccount = async () => {
    if (!user) return;
    if (accountDeletionBlocked) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
        body: {},
      });

      if (error) {
        throw new Error(error.message || 'Account deletion failed.');
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String((data as { error: string }).error));
      }

      setDeleteDialogOpen(false);
      await signOut();
      toast.success('Your account and app data have been deleted.');
      navigate('/auth', { replace: true });
    } catch (error: unknown) {
      console.error('Error deleting account', error);
      const msg = error instanceof Error ? error.message : 'Could not delete account.';
      toast.error(
        `${msg} If you are the project owner, deploy the Edge Function: supabase functions deploy delete-account`,
        { duration: 12_000 },
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-display font-extrabold text-foreground tracking-tight"
          >
            Settings
          </motion.h1>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your account and data.
          </p>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6 space-y-6">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Stake currency</p>
            <p className="text-xs text-muted-foreground">
              New goals and card charges will use this currency. Existing goals keep their original currency.
            </p>
          </div>
          <div ref={currencyPickerRef} className="relative">
            <input
              type="text"
              value={currencySearch}
              onFocus={() => {
                setCurrencyPickerOpen(true);
                setCurrencySearch('');
              }}
              onChange={(e) => {
                setCurrencySearch(e.target.value);
                setCurrencyPickerOpen(true);
              }}
              placeholder="Search currency..."
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {currencyPickerOpen && (
              <div className="absolute z-20 mt-2 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                {filteredCurrencies.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No currencies found.</p>
                ) : (
                  filteredCurrencies.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCurrency(code as StakeCurrency);
                        setCurrencySearch(formatStakeCurrencyLabel(code as StakeCurrency));
                        setCurrencyPickerOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        code === currency
                          ? 'bg-muted text-primary font-medium'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      {formatStakeCurrencyLabel(code as StakeCurrency)}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Sign out</p>
              <p className="text-xs text-muted-foreground">
                Sign out of this device and return to the login screen.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full bg-transparent rounded-xl font-display font-semibold"
            onClick={() => setSignOutDialogOpen(true)}
          >
            Sign out
          </Button>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Delete account</p>
              <p className="text-xs text-muted-foreground">
                Permanently removes your login and related data stored for this app, then signs you out.
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            className="w-full rounded-xl font-display font-bold"
            disabled={loading}
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete my account
          </Button>
        </div>
      </div>

      {retryWindowOpen && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-background/80 backdrop-blur-sm"
            onClick={() => closeRetryWindow(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[100] bg-[#0f0f0f] border-t border-border rounded-t-[32px] h-[640px] max-h-[90vh] overflow-y-visible overflow-x-hidden [color-scheme:dark]">
            <div className="relative h-full flex flex-col p-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-display font-bold text-foreground">Fix failed stake transfer</h2>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl font-display font-semibold"
                  onClick={() => closeRetryWindow(false)}
                >
                  Close
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Update your card details to donate the staked amount for this uncompleted goal.
              </p>
              {retryWindowGoal ? (
                <div className="space-y-3 flex-1 min-h-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Goal</p>
                    <p className="text-sm font-display font-semibold text-foreground truncate max-w-[70%] text-right">
                      {retryWindowGoal.title}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">Stake to donate</p>
                    <p className="text-sm font-display font-bold text-primary tabular-nums">
                      {formatStakeAmount(retryWindowGoal.stake, currency)}
                    </p>
                  </div>
                  <RetryPaymentCardForm
                    goalId={retryWindowGoal.id}
                    onSuccess={() => {
                      retryPaidRef.current = true;
                      closeRetryWindow(false);
                      setFailedPaymentGoals((prev) => prev.filter((g) => g.id !== retryWindowGoal.id));
                      void queryClient.invalidateQueries({ queryKey: queryKeys.goals(user?.id ?? '') });
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Could not find the goal for this payment alert.</p>
              )}
            </div>
          </div>
        </>
      )}

      <AlertDialog
        open={signOutDialogOpen}
        onOpenChange={(open) => {
          if (!loading) setSignOutDialogOpen(open);
        }}
      >
        <AlertDialogContent className="max-w-md border-border sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display font-bold text-foreground pr-8">
              Sign out now?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm text-muted-foreground">
              You&apos;ll be signed out of this device and returned to the login screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel
              disabled={loading}
              className="mt-0 sm:mt-0 rounded-xl font-display font-semibold"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              className="w-full sm:w-auto rounded-xl font-display font-bold relative overflow-hidden transition-all duration-300 ease-in-out"
              onClick={async () => {
                setSignOutDialogOpen(false);
                await signOut();
              }}
            >
              Yes, sign out
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!loading) setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent className="max-w-md border-border sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display font-bold text-foreground pr-8">
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm text-muted-foreground">
              This permanently removes your login and all data stored for this app. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {judgeGoalsLoading && (
            <p className="text-left text-sm text-muted-foreground">Checking goals you judge…</p>
          )}

          {!judgeGoalsLoading && activeStakedJudgeCommitmentCount > 0 && (
            <div
              role="alert"
              className="rounded-xl border-2 border-destructive bg-destructive/15 px-4 py-3 text-left shadow-sm ring-2 ring-destructive/20"
            >
              <p className="text-sm font-bold uppercase tracking-wide text-destructive">
                Judge commitments
              </p>
              <p className="mt-1.5 text-sm font-semibold text-destructive">
                You cannot delete your account while you are the judge on{' '}
                {activeStakedJudgeCommitmentCount} active staked goal
                {activeStakedJudgeCommitmentCount === 1 ? '' : 's'} owned by someone else.
              </p>
              <p className="mt-2 text-xs font-medium leading-relaxed text-destructive/95">
                Those goals still need a final judgment (completed or not) while money is at stake. When
                you have finished with every goal you judge in that situation, you can come back here
                and delete your account.
              </p>
              <Link
                to="/my-judges"
                onClick={() => setDeleteDialogOpen(false)}
                className="mt-3 inline-block text-xs font-bold text-destructive underline underline-offset-2 hover:text-destructive/90"
              >
                Open Goals I judge
              </Link>
            </div>
          )}

          {activeStakesCount > 0 && (
            <div
              role="alert"
              className="rounded-xl border-2 border-destructive bg-destructive/15 px-4 py-3 text-left shadow-sm ring-2 ring-destructive/20"
            >
              <p className="text-sm font-bold uppercase tracking-wide text-destructive">
                Active stakes
              </p>
              <p className="mt-1.5 text-sm font-semibold text-destructive">
                You have {activeStakesCount} active goal{activeStakesCount === 1 ? '' : 's'} with money
                at stake right now.
              </p>
              <p className="mt-2 text-xs font-medium leading-relaxed text-destructive/95">
                Deleting your account removes this data from the app. If you are unsure about charges,
                judges, or deadlines, resolve or finish those goals before you delete.
              </p>
            </div>
          )}

          {!accountDeletionBlocked && (
            <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground/80">
              Hold to accept
            </p>
          )}
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel
              disabled={loading}
              className="mt-0 sm:mt-0 rounded-xl font-display font-semibold"
            >
              {accountDeletionBlocked ? 'Close' : 'Cancel'}
            </AlertDialogCancel>
            {loading ? (
              <Button
                type="button"
                variant="destructive"
                disabled
                className="w-full sm:w-auto rounded-xl font-display font-bold relative overflow-hidden transition-all duration-300 ease-in-out"
              >
                Deleting…
              </Button>
            ) : accountDeletionBlocked ? null : (
              <HoldToConfirmButton
                variant="destructive"
                className="w-full sm:w-auto rounded-xl font-display font-bold relative overflow-hidden transition-all duration-300 ease-in-out"
                idleLabel="Yes, delete my account"
                holdingLabel="Sure?"
                onConfirm={() => confirmDeleteAccount()}
              />
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

