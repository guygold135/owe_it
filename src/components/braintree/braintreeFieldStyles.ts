import { getBraintreeThemeColors, type BraintreeThemeColors } from '@/components/braintree/braintreeTheme';

/** Hosted-field iframe styles — colors must be hex strings Braintree accepts. */
export function buildBraintreeCardFieldOverrides(theme: BraintreeThemeColors = getBraintreeThemeColors()) {
  const { muted, foreground, mutedForeground, destructive } = theme;

  const inputBase = {
    'font-size': '14px',
    'line-height': '20px',
    'font-family': '"Schibsted Grotesk", system-ui, sans-serif',
    color: foreground,
    'background-color': muted,
    'caret-color': foreground,
    '-webkit-font-smoothing': 'antialiased',
  } as const;

  const inputFocused = {
    color: foreground,
    'background-color': muted,
    'caret-color': foreground,
  } as const;

  return {
    fields: {
      number: { placeholder: '•••• •••• •••• ••••' },
      expirationDate: { placeholder: 'MM/YY' },
      cardholderName: { placeholder: 'Name on card' },
    },
    styles: {
      input: { ...inputBase },
      'input:focus': { ...inputFocused },
      'input::placeholder': { color: mutedForeground },
      '::placeholder': { color: mutedForeground },
      ':focus': { ...inputFocused },
      '.valid': { ...inputFocused },
      '.invalid': {
        color: destructive,
        'background-color': muted,
        'caret-color': destructive,
      },
    },
  };
}

/** @deprecated Use buildBraintreeCardFieldOverrides() for live theme colors. */
export const BRAINTREE_CARD_FIELD_OVERRIDES = buildBraintreeCardFieldOverrides();
