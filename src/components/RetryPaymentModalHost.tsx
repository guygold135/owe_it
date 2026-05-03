import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import DropIn, { type Dropin } from 'braintree-web-drop-in-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { HoldToConfirmButton } from '@/components/ui/hold-to-confirm-button';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { formatStakeAmount } from '@/lib/currency';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/hooks/useAuth';
import { getCharityOptionById } from '@/lib/charities';

async function getInvokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object') {
    const maybeContext = (error as { context?: Response }).context;
    if (maybeContext instanceof Response) {
      try {
        const payload = (await maybeContext.clone().json()) as {
          error?: unknown;
          debug?: { provider?: unknown; environment?: unknown; currency?: unknown; merchantAccountId?: unknown };
        };
        if (typeof payload.error === 'string' && payload.error.trim()) {
          const debug = payload.debug;
          const provider = typeof debug?.provider === 'string' ? debug.provider : 'provider';
          const environment = typeof debug?.environment === 'string' ? debug.environment : 'unknown';
          const currency = typeof debug?.currency === 'string' ? debug.currency : 'unknown';
          const merchantAccountId =
            typeof debug?.merchantAccountId === 'string' && debug.merchantAccountId.trim()
              ? debug.merchantAccountId
              : 'none';
          const debugSuffix = debug
            ? ` (${provider} env=${environment} currency=${currency} merchant=${merchantAccountId})`
            : '';
          return `${payload.error.trim()}${debugSuffix}`;
        }
      } catch {
        try {
          const text = await maybeContext.clone().text();
          if (text.trim()) return text.trim();
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

function normalizePaymentErrorMessage(rawMessage: string): string {
  const normalized = rawMessage.trim().toLowerCase();
  if (normalized.includes("do not honor")) {
    const debugMatch = rawMessage.match(/\s(\([^()]*env=[^()]*\))\s*$/i);
    const debugSuffix = debugMatch ? ` ${debugMatch[1]}` : "";
    return `Your bank declined this card (Do Not Honor). Please use a different card or contact your bank.${debugSuffix}`;
  }
  return rawMessage;
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
  const [paymentMethodReady, setPaymentMethodReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingToken(true);
    setTokenError(null);
    setDropinInstance(null);
    setPaymentMethodReady(false);
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
      setPaymentMethodReady(false);
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
        const message = normalizePaymentErrorMessage(
          await getInvokeErrorMessage(invokeError, 'Could not complete the donation transfer.'),
        );
        toast.error(message);
        try {
          await dropinInstance.clearSelectedPaymentMethod();
          setPaymentMethodReady(false);
        } catch {
          // ignore reset failures
        }
        return;
      }
      if (data?.success === false) {
        const debug = (data as {
          debug?: { provider?: string; environment?: string; currency?: string; merchantAccountId?: string | null };
        } | null)?.debug;
        const debugSuffix = debug
          ? ` (${debug.provider ?? 'provider'} env=${debug.environment ?? 'unknown'} currency=${debug.currency ?? 'unknown'} merchant=${debug.merchantAccountId ?? 'none'})`
          : '';
        const message = normalizePaymentErrorMessage(
          `${data?.error ?? 'Could not complete the donation transfer.'}${debugSuffix}`,
        );
        toast.error(message);
        try {
          await dropinInstance.clearSelectedPaymentMethod();
          setPaymentMethodReady(false);
        } catch {
          // ignore reset failures
        }
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
              setPaymentMethodReady(false);
              try {
                instance.clearSelectedPaymentMethod();
              } catch {
                // ignore
              }
            }}
            onPaymentMethodRequestable={() => setPaymentMethodReady(true)}
            onNoPaymentMethodRequestable={() => setPaymentMethodReady(false)}
          />
        )}
      </div>
      <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground/80">
        HOLD TO ACCEPT
      </p>
      <HoldToConfirmButton
        variant="default"
        className="w-full min-h-[56px] rounded-2xl glow-primary font-display text-base font-bold"
        disabled={!dropinInstance || !paymentMethodReady || loadingToken || !!tokenError || submitting}
        idleLabel={submitting ? 'Donating…' : 'Update card and donate now'}
        holdingLabel="Sure?"
        onConfirm={() => void submit()}
      />
    </div>
  );
}

export function RetryPaymentModalHost() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currency } = useStakeCurrencyPreference();
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<{ id: string; title: string; stake: number } | null>(null);
  const [toastContext, setToastContext] = useState<{
    notificationId: string | null;
    goalId: string | null;
    kind: string | null;
    title: string | null;
  } | null>(null);
  const [dismissConfirmOpen, setDismissConfirmOpen] = useState(false);
  const [dismissConfirmContext, setDismissConfirmContext] = useState<{
    notificationId: string | null;
    goalId: string | null;
    kind: string | null;
    title: string | null;
    charityName: string;
  } | null>(null);
  const paidRef = useRef(false);
  const confirmDismissAcceptedRef = useRef(false);

  useEffect(() => {
    if (location.pathname === '/settings') return;
    const onOpenRetryWindow = (event: Event) => {
      const customEvent = event as CustomEvent<{
        notificationId?: string | null;
        goalId?: string | null;
        kind?: string | null;
        title?: string | null;
      }>;
      const requestedGoalId = customEvent.detail?.goalId ?? null;
      if (!requestedGoalId || !user?.id) return;
      paidRef.current = false;
      setToastContext({
        notificationId: customEvent.detail?.notificationId ?? null,
        goalId: requestedGoalId,
        kind: customEvent.detail?.kind ?? null,
        title: customEvent.detail?.title ?? null,
      });
      void supabase
        .from('goals')
        .select('id,title,stake')
        .eq('id', requestedGoalId)
        .eq('user_id', user.id)
        .eq('status', 'failed')
        .eq('payment_status', 'payment_failed')
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) {
            toast.error('Could not open card fix window for this alert.');
            return;
          }
          const row = data as { id: string; title: string | null; stake: number | null };
          setGoal({
            id: String(row.id),
            title: String(row.title ?? 'Goal'),
            stake: Number(row.stake ?? 0),
          });
          setOpen(true);
        });
    };
    window.addEventListener('open-retry-payment-window', onOpenRetryWindow as EventListener);
    return () => window.removeEventListener('open-retry-payment-window', onOpenRetryWindow as EventListener);
  }, [location.pathname, user?.id]);

  useEffect(() => {
    const onConfirmDismiss = (event: Event) => {
      const customEvent = event as CustomEvent<{
        notificationId?: string | null;
        goalId?: string | null;
        kind?: string | null;
        title?: string | null;
      }>;
      const notificationId = customEvent.detail?.notificationId ?? null;
      const goalId = customEvent.detail?.goalId ?? null;
      if (!notificationId) return;

      const openConfirm = (charityName: string) => {
        setDismissConfirmContext({
          notificationId,
          goalId,
          kind: customEvent.detail?.kind ?? null,
          title: customEvent.detail?.title ?? null,
          charityName,
        });
        setDismissConfirmOpen(true);
      };

      if (!goalId) {
        openConfirm(getCharityOptionById(null)?.name ?? 'Default charity pool');
        return;
      }

      void supabase
        .from('goals')
        .select('charity_id')
        .eq('id', goalId)
        .maybeSingle()
        .then(({ data }) => {
          const charityId = (data as { charity_id?: string | null } | null)?.charity_id ?? null;
          const charityName = getCharityOptionById(charityId)?.name ?? getCharityOptionById(null)?.name ?? 'Default charity pool';
          openConfirm(charityName);
        })
        .catch(() => {
          openConfirm(getCharityOptionById(null)?.name ?? 'Default charity pool');
        });
    };

    window.addEventListener('confirm-dismiss-payment-failed', onConfirmDismiss as EventListener);
    return () => window.removeEventListener('confirm-dismiss-payment-failed', onConfirmDismiss as EventListener);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (open || dismissConfirmOpen) {
      root.style.setProperty('--oweit-sonner-z', '110');
      return () => {
        root.style.removeProperty('--oweit-sonner-z');
      };
    }
    root.style.removeProperty('--oweit-sonner-z');
    return () => {
      root.style.removeProperty('--oweit-sonner-z');
    };
  }, [open, dismissConfirmOpen]);

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) return;
    if (!paidRef.current && toastContext?.notificationId) {
      window.dispatchEvent(new CustomEvent('retry-payment-window-cancelled', { detail: toastContext }));
    } else if (paidRef.current) {
      try {
        window.sessionStorage.removeItem('pending_retry_payment_toast_payload');
      } catch {
        // Ignore storage failures.
      }
    }
    setGoal(null);
    setToastContext(null);
    paidRef.current = false;
  };

  return (
    <>
      <AlertDialog open={open} onOpenChange={close}>
        <AlertDialogContent className="w-[min(94vw,56rem)] max-w-4xl max-h-[80vh] overflow-y-auto border-border sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display font-bold text-foreground pr-8">
              Fix failed stake transfer
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm text-muted-foreground">
              Update your card details to donate the staked amount for this uncompleted goal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {goal ? (
            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">{goal.title}</p>
              <p className="text-xs text-muted-foreground">Stake to donate: {formatStakeAmount(goal.stake, currency)}</p>
              <RetryPaymentCardForm
                goalId={goal.id}
                onSuccess={() => {
                  paidRef.current = true;
                  close(false);
                  void queryClient.invalidateQueries({ queryKey: queryKeys.goals(user?.id ?? '') });
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Could not find the goal for this payment alert.</p>
          )}
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="mt-0 sm:mt-0 rounded-xl font-display font-semibold">Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dismissConfirmOpen}
        onOpenChange={(nextOpen) => {
          setDismissConfirmOpen(nextOpen);
          if (!nextOpen) {
            confirmDismissAcceptedRef.current = false;
            setDismissConfirmContext(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-md border-border sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display font-bold text-foreground pr-8">
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm text-muted-foreground">
              If you dismiss this alert, you will not have another way to pay this stake, and it will not go to your chosen charity:{' '}
              <span className="font-semibold text-foreground">{dismissConfirmContext?.charityName ?? 'Default charity pool'}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="mt-0 sm:mt-0 rounded-xl font-display font-semibold">
              Keep alert
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto rounded-xl font-display font-bold"
              onClick={async () => {
                const ctx = dismissConfirmContext;
                confirmDismissAcceptedRef.current = true;
                setDismissConfirmOpen(false);
                setDismissConfirmContext(null);
                if (!ctx?.notificationId || !user?.id) return;

                // Ensure the toast dismissal doesn't re-open the confirmation flow.
                window.dispatchEvent(
                  new CustomEvent('suppress-payment-failed-toast-onDismiss', {
                    detail: { toastId: `payment_failed_${ctx.notificationId}` },
                  }),
                );
              toast.dismiss(`payment_failed_${ctx.notificationId}`);

              const { error } = await supabase
                .from('in_app_notifications')
                .update({ read_at: new Date().toISOString() })
                .eq('id', ctx.notificationId)
                .eq('user_id', user.id);

              if (error) {
                console.warn('Failed to persist payment-failed dismissal', error);
              }

              // Also persist locally so the toast/dialog never comes back on refresh/restart.
              window.dispatchEvent(
                new CustomEvent('payment-failed-dismissed', {
                  detail: { notificationId: ctx.notificationId },
                }),
              );
              }}
            >
              Yes, dismiss alert
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

