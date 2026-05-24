export const SUPPORTED_STAKE_CURRENCIES = [
  'usd',
  'eur',
  'gbp',
  'cad',
  'aud',
  'nzd',
  'chf',
  'sek',
  'nok',
  'dkk',
  'pln',
  'czk',
  'huf',
  'ron',
  'bgn',
  'hrk',
  'isk',
  'try',
  'ils',
  'aed',
  'sar',
  'qar',
  'bhd',
  'omr',
  'jod',
  'egp',
  'mad',
  'zar',
  'kes',
  'ngn',
  'inr',
  'pkr',
  'bdt',
  'lkr',
  'thb',
  'myr',
  'sgd',
  'hkd',
  'jpy',
  'twd',
  'krw',
  'vnd',
  'php',
  'idr',
  'brl',
  'mxn',
  'ars',
  'clp',
  'cop',
  'pen',
  'uyu',
] as const;

export type StakeCurrency = (typeof SUPPORTED_STAKE_CURRENCIES)[number];

export const DEFAULT_STAKE_CURRENCY: StakeCurrency = 'usd';

export const USD_TO_CURRENCY_RATE: Record<StakeCurrency, number> = {
  usd: 1,
  eur: 0.92,
  gbp: 0.79,
  cad: 1.35,
  aud: 1.52,
  nzd: 1.65,
  chf: 0.89,
  sek: 10.5,
  nok: 10.8,
  dkk: 6.85,
  pln: 3.95,
  czk: 23.2,
  huf: 360,
  ron: 4.55,
  bgn: 1.8,
  hrk: 6.9,
  isk: 138,
  try: 32,
  ils: 3.7,
  aed: 3.67,
  sar: 3.75,
  qar: 3.64,
  bhd: 0.38,
  omr: 0.39,
  jod: 0.71,
  egp: 49,
  mad: 10,
  zar: 18.5,
  kes: 130,
  ngn: 1550,
  inr: 83,
  pkr: 278,
  bdt: 117,
  lkr: 300,
  thb: 36,
  myr: 4.7,
  sgd: 1.35,
  hkd: 7.8,
  jpy: 155,
  twd: 31.5,
  krw: 1330,
  vnd: 25000,
  php: 56,
  idr: 15700,
  brl: 5,
  mxn: 17,
  ars: 1050,
  clp: 960,
  cop: 4000,
  pen: 3.75,
  uyu: 39,
};

export const STAKE_CURRENCY_NAMES: Record<StakeCurrency, string> = {
  usd: 'United States Dollar',
  eur: 'Euro',
  gbp: 'British Pound Sterling',
  cad: 'Canadian Dollar',
  aud: 'Australian Dollar',
  nzd: 'New Zealand Dollar',
  chf: 'Swiss Franc',
  sek: 'Swedish Krona',
  nok: 'Norwegian Krone',
  dkk: 'Danish Krone',
  pln: 'Polish Zloty',
  czk: 'Czech Koruna',
  huf: 'Hungarian Forint',
  ron: 'Romanian Leu',
  bgn: 'Bulgarian Lev',
  hrk: 'Croatian Kuna',
  isk: 'Icelandic Krona',
  try: 'Turkish Lira',
  ils: 'Israeli New Shekel',
  aed: 'United Arab Emirates Dirham',
  sar: 'Saudi Riyal',
  qar: 'Qatari Riyal',
  bhd: 'Bahraini Dinar',
  omr: 'Omani Rial',
  jod: 'Jordanian Dinar',
  egp: 'Egyptian Pound',
  mad: 'Moroccan Dirham',
  zar: 'South African Rand',
  kes: 'Kenyan Shilling',
  ngn: 'Nigerian Naira',
  inr: 'Indian Rupee',
  pkr: 'Pakistani Rupee',
  bdt: 'Bangladeshi Taka',
  lkr: 'Sri Lankan Rupee',
  thb: 'Thai Baht',
  myr: 'Malaysian Ringgit',
  sgd: 'Singapore Dollar',
  hkd: 'Hong Kong Dollar',
  jpy: 'Japanese Yen',
  twd: 'New Taiwan Dollar',
  krw: 'South Korean Won',
  vnd: 'Vietnamese Dong',
  php: 'Philippine Peso',
  idr: 'Indonesian Rupiah',
  brl: 'Brazilian Real',
  mxn: 'Mexican Peso',
  ars: 'Argentine Peso',
  clp: 'Chilean Peso',
  cop: 'Colombian Peso',
  pen: 'Peruvian Sol',
  uyu: 'Uruguayan Peso',
};

export function normalizeStakeCurrency(value: unknown): StakeCurrency {
  if (typeof value !== 'string') return DEFAULT_STAKE_CURRENCY;
  const lowered = value.trim().toLowerCase();
  return SUPPORTED_STAKE_CURRENCIES.includes(lowered as StakeCurrency)
    ? (lowered as StakeCurrency)
    : DEFAULT_STAKE_CURRENCY;
}

function stakeCurrencySymbol(currency: StakeCurrency): string {
  try {
    const part = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.toUpperCase(),
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    if (part?.value) return part.value;
  } catch {
    // ignore
  }
  return currency.toUpperCase();
}

export function formatStakeAmount(amount: number, currency: string): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const normalized = normalizeStakeCurrency(currency);
  const roundedCents = Math.round(safeAmount * 100);
  const hasCents = roundedCents % 100 !== 0;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: normalized.toUpperCase(),
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(safeAmount);
}

/** Dashboard “At Risk” zero — avoids locale suffixes like `0 US$` on iPhone. */
export function formatStakeAmountAtRisk(amount: number, currency: string): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const normalized = normalizeStakeCurrency(currency);
  if (Math.round(safeAmount * 100) === 0) {
    return `0${stakeCurrencySymbol(normalized)}`;
  }
  return formatStakeAmount(safeAmount, currency);
}

export function convertStakeAmount(amount: number, fromCurrency: string, toCurrency: string): number {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const from = normalizeStakeCurrency(fromCurrency);
  const to = normalizeStakeCurrency(toCurrency);
  const fromRate = USD_TO_CURRENCY_RATE[from];
  const toRate = USD_TO_CURRENCY_RATE[to];
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) {
    return safeAmount;
  }
  const amountInUsd = safeAmount / fromRate;
  return amountInUsd * toRate;
}

export function formatStakeCurrencyLabel(code: StakeCurrency): string {
  return `${code.toUpperCase()} - ${STAKE_CURRENCY_NAMES[code]}`;
}

