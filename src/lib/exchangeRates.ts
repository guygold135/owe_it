import { normalizeStakeCurrency, type StakeCurrency, USD_TO_CURRENCY_RATE } from '@/lib/currency';
import { isStripeZeroDecimalCurrency } from '@/lib/stripeCurrency';

const OPEN_ER_API_BASE = 'https://open.er-api.com/v6/latest';
const FRANKFURTER_BASE = 'https://api.frankfurter.app';
const CACHE_TTL_MS = 15 * 60 * 1000;

type CacheEntry = { unitsPerUsd: number; at: number };
const rateCache = new Map<string, CacheEntry>();

/**
 * How many units of `currency` equal 1 USD (e.g. ~3.7 for ILS).
 */
export async function getCurrencyUnitsPerOneUsd(currency: string): Promise<number> {
  const c = normalizeStakeCurrency(currency);
  if (c === 'usd') return 1;

  const now = Date.now();
  const hit = rateCache.get(c);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return hit.unitsPerUsd;
  }

  try {
    const units = await fetchUsdUnitsPerCurrency(c);
    rateCache.set(c, { unitsPerUsd: units, at: now });
    return units;
  } catch {
    const fallback = USD_TO_CURRENCY_RATE[c as StakeCurrency];
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
  }
}

async function fetchUsdUnitsPerCurrency(currency: StakeCurrency): Promise<number> {
  const upper = currency.toUpperCase();

  try {
    const res = await fetch(`${OPEN_ER_API_BASE}/USD`);
    if (!res.ok) throw new Error(`open.er-api ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, unknown>; result?: unknown };
    if (data.result !== 'success') throw new Error('open.er-api invalid response');
    const units = Number(data.rates?.[upper]);
    if (!Number.isFinite(units) || units <= 0) throw new Error('open.er-api invalid rate');
    return units;
  } catch {
    const res = await fetch(`${FRANKFURTER_BASE}/latest?amount=1&from=USD&to=${upper}`);
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, unknown> };
    const units = Number(data.rates?.[upper]);
    if (!Number.isFinite(units) || units <= 0) throw new Error('Frankfurter invalid rate');
    return units;
  }
}

export async function convertStakeAmountLive(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const from = normalizeStakeCurrency(fromCurrency);
  const to = normalizeStakeCurrency(toCurrency);
  if (from === to) return safeAmount;

  const [fromUnitsPerUsd, toUnitsPerUsd] = await Promise.all([
    getCurrencyUnitsPerOneUsd(from),
    getCurrencyUnitsPerOneUsd(to),
  ]);
  if (!Number.isFinite(fromUnitsPerUsd) || !Number.isFinite(toUnitsPerUsd) || fromUnitsPerUsd <= 0 || toUnitsPerUsd <= 0) {
    return safeAmount;
  }
  const amountInUsd = safeAmount / fromUnitsPerUsd;
  return amountInUsd * toUnitsPerUsd;
}

/**
 * Smallest stake (major units) that is still at least US$1, rounded up so we never undercut USD 1.
 */
export function minStakeMajorForOneUsd(unitsPerUsd: number, currency: string): number {
  const c = normalizeStakeCurrency(currency);
  if (c === 'usd') return 1;
  const u = Number.isFinite(unitsPerUsd) && unitsPerUsd > 0 ? unitsPerUsd : USD_TO_CURRENCY_RATE[c as StakeCurrency] ?? 1;
  if (isStripeZeroDecimalCurrency(c)) {
    return Math.max(1, Math.ceil(u));
  }
  return Math.ceil(u * 100) / 100;
}
