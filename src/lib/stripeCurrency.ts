/**
 * Stripe expects charge amounts in the smallest currency unit (e.g. cents),
 * except for zero-decimal currencies where the amount is in whole units.
 * @see https://docs.stripe.com/currencies#zero-decimal
 */
const STRIPE_ZERO_DECIMAL = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

export function isStripeZeroDecimalCurrency(currency: string): boolean {
  return STRIPE_ZERO_DECIMAL.has(currency.trim().toLowerCase());
}

export function stakeMajorToStripeUnits(stake: number, currency: string): number {
  const safe = Number.isFinite(stake) ? stake : 0;
  const c = currency.trim().toLowerCase();
  if (isStripeZeroDecimalCurrency(c)) return Math.round(safe);
  return Math.round(safe * 100);
}

export function stripeUnitsToStakeMajor(units: number, currency: string): number {
  const safe = Number.isFinite(units) ? units : 0;
  const c = currency.trim().toLowerCase();
  if (isStripeZeroDecimalCurrency(c)) return safe;
  return safe / 100;
}
