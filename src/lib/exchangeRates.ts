import { normalizeStakeCurrency, type StakeCurrency, USD_TO_CURRENCY_RATE } from '@/lib/currency';
import { isStripeZeroDecimalCurrency } from '@/lib/stripeCurrency';

const FRANKFURTER_BASE = 'https://api.frankfurter.app';
const CACHE_TTL_MS = 60 * 60 * 1000;

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
    const url = `${FRANKFURTER_BASE}/latest?amount=1&from=USD&to=${c.toUpperCase()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const data = (await res.json()) as { amount?: unknown };
    const amt = Number(data.amount);
    if (!Number.isFinite(amt) || amt <= 0) throw new Error('Invalid rate');
    rateCache.set(c, { unitsPerUsd: amt, at: now });
    return amt;
  } catch {
    const fallback = USD_TO_CURRENCY_RATE[c as StakeCurrency];
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
  }
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
