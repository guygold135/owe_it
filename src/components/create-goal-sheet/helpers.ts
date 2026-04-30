import { USD_TO_CURRENCY_RATE } from '@/lib/currency';
import { isStripeZeroDecimalCurrency } from '@/lib/stripeCurrency';

export const steps = ['goal', 'stake', 'judge', 'card', 'confirm'] as const;

const USD_BASE_PRESET_STAKES = [0, 10, 25, 50, 75, 100, 150, 200] as const;

/** Minimum time between "now" and deadline (must be strictly after this window). */
export const MIN_DEADLINE_LEAD_MS = 24 * 60 * 60 * 1000;

/** Large dot prefix for each requirement line (textarea). */
export const REQUIREMENT_BULLET = '●';

export function toDatetimeLocalString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getDeadlineValidationError(
  deadlineDate: Date | null,
  hasValue: boolean,
  allowShortDeadlines: boolean,
  now = Date.now(),
): string | null {
  if (!hasValue) return null;
  if (!deadlineDate || Number.isNaN(deadlineDate.getTime())) return 'Please set a valid deadline.';
  if (deadlineDate.getTime() <= now) return 'Choose a deadline in the future.';
  if (!allowShortDeadlines && deadlineDate.getTime() <= now + MIN_DEADLINE_LEAD_MS) {
    return 'Deadline must be more than 1 day from now.';
  }
  return null;
}

export function normalizeRequirementLines(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmedStart = line.trimStart();
      if (trimmedStart === '') return '';
      if (/^[•·●\-*]\s?/.test(trimmedStart)) return line.trimEnd();
      const lead = line.match(/^\s*/)?.[0] ?? '';
      return `${lead}${REQUIREMENT_BULLET} ${trimmedStart.trimEnd()}`;
    })
    .join('\n')
    .replace(/\n+$/, '');
}

export function isRequirementsContentEmpty(text: string): boolean {
  if (!text.trim()) return true;
  return text.split('\n').every((line) => line.replace(/^[•·●\-*]\s*/, '').trim() === '');
}

export function formatStakePresetAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getPowerOfTenPresetMultiplier(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  const candidates = [1, 10, 100, 1000, 10000];
  let best = 1;
  let bestDiff = Math.abs(rate - 1);
  for (const c of candidates) {
    const diff = Math.abs(rate - c);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best;
}

export function buildPresetStakesForCurrency(currency: string): number[] {
  const rate = USD_TO_CURRENCY_RATE[currency as keyof typeof USD_TO_CURRENCY_RATE] ?? 1;
  const multiplier = getPowerOfTenPresetMultiplier(rate);
  return USD_BASE_PRESET_STAKES.map((usdAmount) => {
    const raw = usdAmount * multiplier;
    return isStripeZeroDecimalCurrency(currency) ? Math.round(raw) : raw;
  });
}

export function roundStakeMajor(num: number, currency: string): number {
  if (isStripeZeroDecimalCurrency(currency)) return Math.round(num);
  return Math.round(num * 100) / 100;
}
