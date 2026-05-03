import { useEffect, useState } from 'react';
import DropIn, { type Dropin } from 'braintree-web-drop-in-react';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatStakeAmount } from '@/lib/currency';
import { supabase } from '@/integrations/supabase/client';

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
  hideContent,
}: {
  stake: number;
  stakeCurrency: string;
  onDropinReady: (instance: Dropin | null) => void;
  hideContent?: boolean;
}) {
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [mountDropin, setMountDropin] = useState(false);
  const [dropinKey, setDropinKey] = useState(0);
  const [dropinReady, setDropinReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingToken(true);
    setTokenError(null);
    onDropinReady(null);
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
    };
  }, [onDropinReady]);

  useEffect(() => {
    if (!clientToken) {
      setMountDropin(false);
      setDropinReady(false);
      return;
    }
    setDropinReady(false);
    const mountTimer = window.setTimeout(() => {
      setMountDropin(true);
      // Braintree iframes can get stuck inside animated containers until a reflow happens.
      window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
    }, 220);
    return () => window.clearTimeout(mountTimer);
  }, [clientToken, dropinKey]);

  useEffect(() => {
    if (!mountDropin || dropinReady) return;
    const staleTimer = window.setTimeout(() => {
      setDropinKey((k) => k + 1);
    }, 6000);
    return () => window.clearTimeout(staleTimer);
  }, [mountDropin, dropinReady]);

  return (
    <div className="relative space-y-3 flex-1 overflow-hidden rounded-2xl">
      <style>{`
        .braintree-dark .braintree-dropin,
        .braintree-dark .braintree-dropin * {
          color: hsl(var(--foreground)) !important;
          border-color: hsl(var(--border)) !important;
        }
        .braintree-dark .braintree-dropin,
        .braintree-dark .braintree-dropin .braintree-upper-container {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        .braintree-dark .braintree-dropin .braintree-upper-container,
        .braintree-dark .braintree-dropin .braintree-sheet__container,
        .braintree-dark .braintree-dropin .braintree-sheet,
        .braintree-dark .braintree-dropin .braintree-sheet__header,
        .braintree-dark .braintree-dropin .braintree-sheet__content,
        .braintree-dark .braintree-dropin .braintree-sheet__content--form {
          background: hsl(var(--background)) !important;
        }
        .braintree-dark .braintree-dropin .braintree-upper-container,
        .braintree-dark .braintree-dropin .braintree-sheet__container,
        .braintree-dark .braintree-dropin .braintree-card,
        .braintree-dark .braintree-dropin .braintree-sheet {
          border-radius: 16px !important;
          overflow: hidden !important;
        }
        .braintree-dark .braintree-dropin .braintree-upper-container,
        .braintree-dark .braintree-dropin .braintree-sheet__container,
        .braintree-dark .braintree-dropin .braintree-card {
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        .braintree-dark .braintree-dropin .braintree-lower-container,
        .braintree-dark .braintree-dropin [data-braintree-id="lower-container"] {
          display: none !important;
        }
        .braintree-dark .braintree-dropin .braintree-loader__container,
        .braintree-dark .braintree-dropin [data-braintree-id="loading-container"] {
          display: none !important;
        }
        .braintree-dark .braintree-dropin .braintree-form__field-group,
        .braintree-dark .braintree-dropin .braintree-form__field {
          background: hsl(var(--muted) / 0.45) !important;
          border-radius: 12px !important;
        }
        .braintree-dark .braintree-dropin .braintree-sheet__content--form {
          background: hsl(var(--muted)) !important;
        }
        .braintree-dark .braintree-dropin .braintree-form__field-group,
        .braintree-dark .braintree-dropin .braintree-form__field-group:focus-within,
        .braintree-dark .braintree-dropin [data-braintree-id="cardholder-name-field-group"],
        .braintree-dark .braintree-dropin [data-braintree-id="number-field-group"],
        .braintree-dark .braintree-dropin [data-braintree-id="expiration-date-field-group"] {
          background: hsl(var(--muted)) !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
        .braintree-dark .braintree-dropin .braintree-form__flexible-fields,
        .braintree-dark .braintree-dropin .braintree-form__flexible-field {
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        .braintree-dark .braintree-dropin .braintree-placeholder,
        .braintree-dark .braintree-dropin .braintree-form__label {
          color: hsl(var(--muted-foreground)) !important;
        }
      `}</style>
      {!hideContent && !(loadingToken || (clientToken && !dropinReady)) && (
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            Only your card will be charged {formatStakeAmount(stake, stakeCurrency)},
          </span>{' '}
          if you don&apos;t complete your goal by the deadline.
        </p>
      )}

      <div className={`relative braintree-dark ${hideContent ? 'min-h-[320px]' : 'min-h-[180px]'}`}>
        {tokenError && <p className="text-sm text-destructive">{tokenError}</p>}
        {clientToken && mountDropin && (
          <DropIn
            key={dropinKey}
            options={{
              authorization: clientToken,
              card: { cardholderName: true },
              paypal: false,
            }}
            onInstance={(instance) => {
              setDropinReady(true);
              onDropinReady(instance);
            }}
          />
        )}
        {clientToken && !dropinReady && !loadingToken && !tokenError && (
          <button
            type="button"
            onClick={() => setDropinKey((k) => k + 1)}
            className="absolute right-2 top-2 z-30 rounded-lg border border-border bg-background/60 px-2 py-1 text-xs text-foreground hover:bg-background/80"
          >
            Retry
          </button>
        )}
      </div>
      {(loadingToken || (clientToken && !dropinReady)) && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background px-6">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm text-muted-foreground">
            Loading secure card form…
          </p>
        </div>
      )}
    </div>
  );
}

export function CardStepContinueButton({
  onPaymentMethodReady,
  dropinInstance,
  onSubmittingChange,
}: {
  onPaymentMethodReady: (payload: { token: string; customerId: string | null }) => void;
  dropinInstance: Dropin | null;
  onSubmittingChange?: (isSubmitting: boolean) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = async () => {
    if (!dropinInstance) {
      toast.error('Payment form is still loading. Please wait and try again.');
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
      disabled={submitting}
      className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {submitting ? 'Saving card…' : <>Continue <ChevronRight className="w-4 h-4" /></>}
    </button>
  );
}
