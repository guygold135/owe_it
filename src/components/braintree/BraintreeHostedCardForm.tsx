import { useEffect, useId, useRef, useState } from 'react';
import { client, hostedFields } from 'braintree-web';
import type { HostedFields } from 'braintree-web';
import '@/components/braintree/braintree-hosted-fields.css';
import { buildBraintreeHostedFieldsStyles } from '@/components/braintree/braintreeHostedFieldsStyles';
import {
  areHostedCardFieldsComplete,
  areHostedFieldsStateComplete,
  type BraintreePaymentInstance,
} from '@/components/braintree/braintreePayment';

const FIELD =
  'braintree-hf-field w-full min-h-12 rounded-xl bg-muted px-4 py-3 transition-shadow focus:outline-none';

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function toPaymentInstance(hf: HostedFields): BraintreePaymentInstance {
  return {
    requestPaymentMethod: () =>
      new Promise((resolve, reject) => {
        hf.tokenize((err, payload) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({ nonce: payload?.nonce });
        });
      }),
    isCardFormComplete: () => areHostedCardFieldsComplete(hf),
  };
}

export function BraintreeHostedCardForm({
  clientToken,
  onReady,
  onError,
  onFieldsCompleteChange,
}: {
  clientToken: string;
  onReady: (instance: BraintreePaymentInstance | null) => void;
  onError: (message: string) => void;
  onFieldsCompleteChange?: (complete: boolean) => void;
}) {
  const id = useId().replace(/:/g, '');
  const numberRef = useRef<HTMLDivElement>(null);
  const expirationRef = useRef<HTMLDivElement>(null);
  const cvvRef = useRef<HTMLDivElement>(null);
  const [mountError, setMountError] = useState<string | null>(null);
  const onFieldsCompleteChangeRef = useRef(onFieldsCompleteChange);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onFieldsCompleteChangeRef.current = onFieldsCompleteChange;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let hf: HostedFields | null = null;

    const reportFieldsComplete = (instance: HostedFields | null) => {
      onFieldsCompleteChangeRef.current?.(instance ? areHostedCardFieldsComplete(instance) : false);
    };

    const reportFromState = (state: Parameters<typeof areHostedFieldsStateComplete>[0]) => {
      onFieldsCompleteChangeRef.current?.(areHostedFieldsStateComplete(state));
    };

    onReadyRef.current(null);
    reportFieldsComplete(null);
    setMountError(null);

    const mount = async () => {
      if (!numberRef.current || !expirationRef.current || !cvvRef.current) {
        return;
      }

      try {
        const clientInstance = await client.create({ authorization: clientToken });
        if (cancelled) {
          await clientInstance.teardown();
          return;
        }

        hf = await hostedFields.create({
          client: clientInstance,
          styles: buildBraintreeHostedFieldsStyles(),
          fields: {
            number: {
              container: numberRef.current,
              placeholder: 'Card number',
            },
            expirationDate: {
              container: expirationRef.current,
              placeholder: 'MM / YY',
            },
            cvv: {
              container: cvvRef.current,
              placeholder: 'CVV',
            },
          },
        });

        if (cancelled) {
          await hf.teardown();
          return;
        }

        const syncFromInstance = () => {
          if (hf) reportFieldsComplete(hf);
        };
        const syncFromEvent = (event: Parameters<typeof areHostedFieldsStateComplete>[0]) => {
          reportFromState(event);
        };

        hf.on('validityChange', syncFromEvent);
        hf.on('blur', syncFromEvent);
        hf.on('empty', syncFromEvent);
        hf.on('notEmpty', syncFromEvent);
        hf.on('cardTypeChange', syncFromEvent);
        syncFromInstance();

        onReadyRef.current(toPaymentInstance(hf));
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load card form.';
        setMountError(message);
        onErrorRef.current(message);
        onReadyRef.current(null);
      }
    };

    const timer = window.setTimeout(() => void mount(), 50);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      onReadyRef.current(null);
      reportFieldsComplete(null);
      if (hf) {
        void hf.teardown().catch(() => undefined);
      }
    };
  }, [clientToken]);

  if (mountError) {
    return (
      <p className="rounded-xl bg-muted px-3 py-2 text-xs text-destructive ring-2 ring-destructive">
        {mountError}
      </p>
    );
  }

  return (
    <div className="owe-braintree-hosted space-y-2" data-bt-form={id}>
      <FieldLabel label="Card number">
        <div ref={numberRef} className={FIELD} />
      </FieldLabel>
      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label="Expiration">
          <div ref={expirationRef} className={FIELD} />
        </FieldLabel>
        <FieldLabel label="CVV">
          <div ref={cvvRef} className={FIELD} />
        </FieldLabel>
      </div>
    </div>
  );
}

