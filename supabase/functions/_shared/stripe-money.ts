/** Same list as Stripe zero-decimal presentment currencies. */
const STRIPE_ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

const SUPPORTED = new Set([
  "usd", "eur", "gbp", "cad", "aud", "nzd", "chf", "sek", "nok", "dkk", "pln", "czk", "huf",
  "ron", "bgn", "hrk", "isk", "try", "ils", "aed", "sar", "qar", "bhd", "omr", "jod", "egp",
  "mad", "zar", "kes", "ngn", "inr", "pkr", "bdt", "lkr", "thb", "myr", "sgd", "hkd", "jpy",
  "twd", "krw", "vnd", "php", "idr", "brl", "mxn", "ars", "clp", "cop", "pen", "uyu",
]);

/** Fallback: units of currency per 1 USD (aligned with app `USD_TO_CURRENCY_RATE`). */
const FALLBACK_UNITS_PER_USD: Record<string, number> = {
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

const FRANKFURTER_BASE = "https://api.frankfurter.app";
const CACHE_TTL_MS = 60 * 60 * 1000;
const rateCache = new Map<string, { unitsPerUsd: number; at: number }>();

export function normalizeStakeCurrency(value: unknown): string {
  if (typeof value !== "string") return "usd";
  const lowered = value.trim().toLowerCase();
  return SUPPORTED.has(lowered) ? lowered : "usd";
}

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

export function minMajorStakeForOneUsd(unitsPerUsd: number, currency: string): number {
  const c = currency.trim().toLowerCase();
  if (c === "usd") return 1;
  const u = Number.isFinite(unitsPerUsd) && unitsPerUsd > 0
    ? unitsPerUsd
    : (FALLBACK_UNITS_PER_USD[c] ?? 1);
  if (isStripeZeroDecimalCurrency(c)) return Math.max(1, Math.ceil(u));
  return Math.ceil(u * 100) / 100;
}

export async function getCurrencyUnitsPerOneUsd(currency: string): Promise<number> {
  const c = normalizeStakeCurrency(currency);
  if (c === "usd") return 1;
  const now = Date.now();
  const hit = rateCache.get(c);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.unitsPerUsd;
  try {
    const url = `${FRANKFURTER_BASE}/latest?amount=1&from=USD&to=${c.toUpperCase()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { amount?: unknown };
    const amt = Number(data.amount);
    if (!Number.isFinite(amt) || amt <= 0) throw new Error("bad amount");
    rateCache.set(c, { unitsPerUsd: amt, at: now });
    return amt;
  } catch {
    return FALLBACK_UNITS_PER_USD[c] ?? 1;
  }
}

export async function resolveMinimumStakeMajor(currency: string): Promise<number> {
  const units = await getCurrencyUnitsPerOneUsd(currency);
  return minMajorStakeForOneUsd(units, currency);
}
