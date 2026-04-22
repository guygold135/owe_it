import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Elements, CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js';
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
import { useShortDeadlineTesting } from '@/hooks/useShortDeadlineTesting';
import { useGoals } from '@/hooks/useGoals';
import { useGoalsAsJudge } from '@/hooks/useGoalsAsJudge';
import UserProfilePopover from '@/components/UserProfilePopover';
import { stripePromise } from '@/lib/stripe';
import { queryKeys } from '@/lib/queryKeys';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#f4f4f5',
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#f87171' },
  },
};

function RetryPaymentCardForm({
  goalId,
  onSuccess,
}: {
  goalId: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

  const submit = async () => {
    if (!stripe || !elements || submitting) return;
    const card = elements.getElement(CardElement);
    if (!card) return toast.error('Please enter card details first.');
    setSubmitting(true);
    try {
      const { error, paymentMethod } = await stripe.createPaymentMethod({ type: 'card', card });
      if (error || !paymentMethod?.id) {
        toast.error(error?.message ?? 'Could not save your card details.');
        return;
      }
      const { data, error: invokeError } = await supabase.functions.invoke('retry-failed-goal-payment', {
        body: { goalId, paymentMethodId: paymentMethod.id },
      });
      if (invokeError || data?.success === false) {
        toast.error(data?.error ?? invokeError?.message ?? 'Could not complete the donation transfer.');
        return;
      }
      toast.success('Stake donation completed successfully.');
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not complete payment retry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-muted p-3">
        <CardElement
          options={CARD_ELEMENT_OPTIONS}
          onChange={(event: StripeCardElementChangeEvent) => {
            setCardComplete(event.complete);
          }}
        />
      </div>
      <HoldToConfirmButton
        variant="default"
        className="w-full min-h-[56px] rounded-2xl glow-primary font-display text-base font-bold"
        disabled={!stripe || !elements || !cardComplete || submitting}
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
  const { enabled: allowShortDeadlines, setEnabled: setAllowShortDeadlines } = useShortDeadlineTesting();
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

  useEffect(() => {
    setCurrencySearch(formatStakeCurrencyLabel(currency));
  }, [currency]);

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return SUPPORTED_STAKE_CURRENCIES;
    return SUPPORTED_STAKE_CURRENCIES.filter((code) => {
      const label = formatStakeCurrencyLabel(code).toLowerCase();
      return label.includes(q) || code.toLowerCase().includes(q);
    });
  }, [currencySearch]);

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
          (data ?? []).map((row: any) => ({
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
          const fetchedGoal = {
            id: String((data as any).id),
            title: String((data as any).title ?? 'Goal'),
            stake: Number((data as any).stake ?? 0),
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
        <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl border-dashed"
            onClick={async () => {
              let {
                data: { session },
              } = await supabase.auth.getSession();
              if (!session?.access_token) {
                const refreshResult = await supabase.auth.refreshSession();
                session = refreshResult.data.session;
              }
              const accessToken = String(session?.access_token ?? '').trim().replace(/^Bearer\s+/i, '');
              if (!accessToken) {
                toast.error('Session expired. Please sign in again.');
                return;
              }

              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
              const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
              if (!supabaseUrl || !apikey) {
                toast.error('Supabase env is missing in app configuration.');
                return;
              }

              const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/debug-trigger-payment-failed-alert`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  apikey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
              });

              const raw = await res.text();
              let parsed: { success?: boolean; error?: string } | null = null;
              try {
                parsed = raw ? JSON.parse(raw) : null;
              } catch {
                parsed = null;
              }

              if (!res.ok || parsed?.success === false) {
                toast.error(parsed?.error ?? raw?.trim() ?? `Debug trigger failed (${res.status}).`);
                return;
              }
              toast.success('Debug payment-failed flow triggered.');
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.goals(user?.id ?? '') }),
                queryClient.invalidateQueries({ queryKey: queryKeys.goalsAsJudge(user?.id ?? '') }),
              ]);
            }}
          >
            Debug: trigger failed transfer on latest goal
        </Button>

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
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Allow short deadlines (testing)</p>
              <p className="text-xs text-muted-foreground">
                Enables creating goals with deadlines in less than 24 hours.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAllowShortDeadlines(!allowShortDeadlines)}
              className={`w-12 h-7 rounded-full transition-colors relative ${allowShortDeadlines ? 'bg-primary' : 'bg-border'}`}
              aria-label="Toggle short deadline testing mode"
            >
              <div className={`w-5 h-5 rounded-full bg-foreground absolute top-1 transition-transform ${allowShortDeadlines ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
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

      <AlertDialog
        open={retryWindowOpen}
        onOpenChange={closeRetryWindow}
      >
        <AlertDialogContent className="max-w-md border-border sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display font-bold text-foreground pr-8">
              Fix failed stake transfer
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm text-muted-foreground">
              Update your card details to donate the staked amount for this uncompleted goal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {retryWindowGoal ? (
            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">{retryWindowGoal.title}</p>
              <p className="text-xs text-muted-foreground">
                Stake to donate: {formatStakeAmount(retryWindowGoal.stake, currency)}
              </p>
              {stripePromise ? (
                <Elements stripe={stripePromise}>
                  <RetryPaymentCardForm
                    goalId={retryWindowGoal.id}
                    onSuccess={() => {
                      retryPaidRef.current = true;
                      closeRetryWindow(false);
                      setFailedPaymentGoals((prev) => prev.filter((g) => g.id !== retryWindowGoal.id));
                      void queryClient.invalidateQueries({ queryKey: queryKeys.goals(user?.id ?? '') });
                    }}
                  />
                </Elements>
              ) : (
                <p className="text-xs text-destructive">Stripe is not configured in this build.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Could not find the goal for this payment alert.</p>
          )}
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="mt-0 sm:mt-0 rounded-xl font-display font-semibold">
              Close
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

