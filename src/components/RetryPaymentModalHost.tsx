import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Elements, CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { HoldToConfirmButton } from '@/components/ui/hold-to-confirm-button';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { stripePromise } from '@/lib/stripe';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { formatStakeAmount } from '@/lib/currency';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/hooks/useAuth';
import { getCharityOptionById } from '@/lib/charities';

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
          onChange={(event: StripeCardElementChangeEvent) => setCardComplete(event.complete)}
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
          setGoal({
            id: String((data as any).id),
            title: String((data as any).title ?? 'Goal'),
            stake: Number((data as any).stake ?? 0),
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
        <AlertDialogContent className="max-w-md border-border sm:rounded-2xl">
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
              {stripePromise ? (
                <Elements stripe={stripePromise}>
                  <RetryPaymentCardForm
                    goalId={goal.id}
                    onSuccess={() => {
                      paidRef.current = true;
                      close(false);
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
            <AlertDialogCancel className="mt-0 sm:mt-0 rounded-xl font-display font-semibold">Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dismissConfirmOpen}
        onOpenChange={(nextOpen) => {
          setDismissConfirmOpen(nextOpen);
          if (!nextOpen) {
            if (!confirmDismissAcceptedRef.current && dismissConfirmContext?.notificationId) {
              window.dispatchEvent(
                new CustomEvent('retry-payment-window-cancelled', {
                  detail: {
                    notificationId: dismissConfirmContext.notificationId,
                    goalId: dismissConfirmContext.goalId,
                    kind: dismissConfirmContext.kind,
                    title: dismissConfirmContext.title,
                  },
                }),
              );
            }
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
                await supabase
                  .from('in_app_notifications')
                  .update({ read_at: new Date().toISOString() })
                  .eq('id', ctx.notificationId)
                  .eq('user_id', user.id);
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

