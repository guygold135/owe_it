import type { HostedFields } from 'braintree-web';

/** Minimal handle shared by Drop-in and Hosted Fields for vaulting. */
export type BraintreePaymentInstance = {
  requestPaymentMethod: () => Promise<{ nonce?: string }>;
  /** Latest Braintree hosted-fields completeness (card number, expiry, CVV). */
  isCardFormComplete?: () => boolean;
};

const REQUIRED_HOSTED_FIELDS = ['number', 'expirationDate', 'cvv'] as const;

type HostedFieldsState = ReturnType<HostedFields['getState']>;

/** True when required hosted fields pass Braintree validation (see getState docs). */
export function areHostedFieldsStateComplete(state: HostedFieldsState): boolean {
  return REQUIRED_HOSTED_FIELDS.every((key) => state.fields[key]?.isValid === true);
}

/** True when card number, expiry, and CVV are valid for tokenize. */
export function areHostedCardFieldsComplete(hf: HostedFields): boolean {
  return areHostedFieldsStateComplete(hf.getState());
}
