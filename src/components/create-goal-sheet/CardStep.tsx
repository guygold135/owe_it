import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatStakeAmount } from '@/lib/currency';
import { supabase } from '@/integrations/supabase/client';
import { BraintreeHostedCardForm } from '@/components/braintree/BraintreeHostedCardForm';
import type { BraintreePaymentInstance } from '@/components/braintree/braintreePayment';

async function getFreshAccessToken(): Promise<string> {
  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new Error(userError.message ?? 'Not authenticated.');
  }

  const {
    data: { session: initialSession },
    error: sessionError,
  } = await supabase.auth.getSession();
  let session = initialSession;
  if (sessionError) {
    console.error('Could not read auth session before invoking edge function', sessionError);
  }

  if (!session?.access_token) {
    const refreshResult = await supabase.auth.refreshSession();
    session = refreshResult.data.session;
    if (refreshResult.error) {
      console.error('Could not refresh auth session before invoking edge function', refreshResult.error);
    }
  }

  const token = String(session?.access_token ?? '').trim().replace(/^Bearer\s+/i, '');
  if (!token) {
    throw new Error('Your session expired. Please sign in again and try again.');
  }
  if (!token.includes('.')) {
    throw new Error('Your auth token is invalid. Please sign out and sign in again.');
  }
  return token;
}

async function invokeWithFreshSession<TData = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: TData | null; error: unknown }> {
  const accessToken = await getFreshAccessToken();
  return supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function getInvokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object') {
    const maybeContext = (error as { context?: Response }).context;
    if (maybeContext instanceof Response) {
      try {
        const payload = (await maybeContext.clone().json()) as { error?: unknown };
        if (typeof payload.error === 'string' && payload.error.trim()) {
          return payload.error.trim();
        }
      } catch {
        try {
          const text = await maybeContext.clone().text();
          if (text.trim()) return text.trim();
        } catch {
          // ignore
        }
      }
      const statusText = maybeContext.statusText?.trim();
      if (statusText) return `${fallback} (${maybeContext.status} ${statusText})`;
      return `${fallback} (status ${maybeContext.status})`;
    }
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  return fallback;
}

export function CardStepFields({
  stake,
  stakeCurrency,
  onDropinReady,
  onCardFieldsCompleteChange,
  hideContent,
}: {
  stake: number;
  stakeCurrency: string;
  onDropinReady: (instance: BraintreePaymentInstance | null) => void;
  onCardFieldsCompleteChange?: (complete: boolean) => void;
  hideContent?: boolean;
}) {
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const handleReady = useCallback(
    (instance: BraintreePaymentInstance | null) => {
      setFormReady(Boolean(instance));
      if (!instance) onCardFieldsCompleteChange?.(false);
      onDropinReady(instance);
    },
    [onDropinReady, onCardFieldsCompleteChange],
  );

  const handleFormError = useCallback((message: string) => {
    setTokenError(message);
    setFormReady(false);
    onDropinReady(null);
  }, [onDropinReady]);

  useEffect(() => {
    let cancelled = false;
    setLoadingToken(true);
    setTokenError(null);
    setFormReady(false);
    onDropinReady(null);
    onCardFieldsCompleteChange?.(false);
    void invokeWithFreshSession<{ clientToken?: unknown }>('create-braintree-client-token', {}).then(({ data, error }) => {
        if (error) {
          throw error;
        }
        const token = data?.clientToken;
        if (typeof token !== 'string' || !token) {
          throw new Error('Missing Braintree client token');
        }
        if (cancelled) return;
        setClientToken(token);
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        const message = await getInvokeErrorMessage(err, 'Could not initialize payment form.');
        setTokenError(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingToken(false);
      });
    return () => {
      cancelled = true;
      onDropinReady(null);
      onCardFieldsCompleteChange?.(false);
    };
  }, [onDropinReady, onCardFieldsCompleteChange]);

  const showLoading = loadingToken || (clientToken && !formReady);

  return (
    <div className="relative flex flex-1 min-h-0 flex-col gap-4">
      {!hideContent && !showLoading && stake > 0 && (
        <div className="shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-muted/50 via-muted/25 to-transparent p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Stake on the line
          </p>
          <div className="mt-1 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <p className="font-display text-3xl font-extrabold tabular-nums text-primary">
              {formatStakeAmount(stake, stakeCurrency)}
            </p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Your card is charged only if you don&apos;t complete your goal by the deadline.
          </p>
        </div>
      )}

      <div className={`relative flex-1 min-h-0 ${hideContent ? 'min-h-[140px]' : ''}`}>
        {tokenError && (
          <p className="rounded-xl bg-muted px-3 py-2 text-xs text-destructive ring-2 ring-destructive">
            {tokenError}
          </p>
        )}
        {clientToken && !tokenError && (
          <BraintreeHostedCardForm
            key={`${clientToken}-${formKey}`}
            clientToken={clientToken}
            onReady={handleReady}
            onError={handleFormError}
            onFieldsCompleteChange={onCardFieldsCompleteChange}
          />
        )}
        {clientToken && !formReady && !loadingToken && !tokenError && (
          <button
            type="button"
            onClick={() => {
              setFormKey((k) => k + 1);
              setFormReady(false);
              onCardFieldsCompleteChange?.(false);
            }}
            className="absolute right-0 top-0 z-30 rounded-xl bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Retry
          </button>
        )}
      </div>

      {!hideContent && !showLoading && (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          Encrypted · PCI compliant
        </p>
      )}

      {showLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background/95 px-6 backdrop-blur-[2px]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Preparing secure checkout…</p>
        </div>
      )}
    </div>
  );
}

export function CardStepContinueButton({
  onPaymentMethodReady,
  dropinInstance,
  onSubmittingChange,
  consentAccepted,
  cardFieldsComplete,
}: {
  onPaymentMethodReady: (payload: { token: string; customerId: string | null }) => void;
  dropinInstance: BraintreePaymentInstance | null;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  consentAccepted: boolean;
  cardFieldsComplete: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);

  const fieldsReady =
    cardFieldsComplete || dropinInstance?.isCardFormComplete?.() === true;

  const handleContinue = async () => {
    if (!consentAccepted) {
      toast.error('Please confirm the payment authorization notice to continue.');
      return;
    }
    if (!dropinInstance) {
      toast.error('Payment form is still loading. Please wait and try again.');
      return;
    }
    if (!fieldsReady) {
      toast.error('Please enter your complete card details.');
      return;
    }
    setSubmitting(true);
    onSubmittingChange?.(true);
    try {
      const method = await dropinInstance.requestPaymentMethod();
      const nonce = method?.nonce;
      if (!nonce) {
        toast.error('Please enter your card details.');
        return;
      }

      const { data, error } = await invokeWithFreshSession<{
        paymentMethodToken?: unknown;
        braintreeCustomerId?: unknown;
        success?: unknown;
      }>('vault-braintree-payment-method', { paymentMethodNonce: nonce });
      if (error) throw error;

      const payload = data;
      if (!payload || payload.success !== true || typeof payload.paymentMethodToken !== 'string') {
        throw new Error('Could not save card token for delayed charge.');
      }

      onPaymentMethodReady({
        token: payload.paymentMethodToken,
        customerId: typeof payload.braintreeCustomerId === 'string' ? payload.braintreeCustomerId : null,
      });
    } catch (error: unknown) {
      console.error('Braintree error', error);
      const message = await getInvokeErrorMessage(error, 'Something went wrong saving your card.');
      toast.error(message);
    } finally {
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleContinue}
      disabled={submitting || !dropinInstance || !fieldsReady}
      className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-display font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {submitting ? 'Saving card…' : <>Save card <ChevronRight className="h-4 w-4" /></>}
    </button>
  );
}
