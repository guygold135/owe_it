import { getBraintreeThemeColors, type BraintreeThemeColors } from '@/components/braintree/braintreeTheme';

/**
 * Hosted Fields `styles` — only properties Braintree allows inside iframes.
 * Iframe interiors stay white; ink must contrast on white (not app `foreground`).
 */
export function buildBraintreeHostedFieldsStyles(theme: BraintreeThemeColors = getBraintreeThemeColors()) {
  const { hostedFieldInk, hostedFieldPlaceholder, destructive } = theme;

  return {
    input: {
      'font-size': '16px',
      'line-height': '24px',
      'font-family': '"Schibsted Grotesk", system-ui, sans-serif',
      color: hostedFieldInk,
      '-webkit-font-smoothing': 'antialiased',
    },
    '::placeholder': {
      color: hostedFieldPlaceholder,
    },
    ':focus': {
      color: hostedFieldInk,
    },
    '.valid': {
      color: hostedFieldInk,
    },
    '.invalid': {
      color: destructive,
    },
  };
}
