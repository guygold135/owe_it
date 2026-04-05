import { useEffect, useState } from 'react';
import { normalizeStakeCurrency, type StakeCurrency, USD_TO_CURRENCY_RATE } from '@/lib/currency';
import { getCurrencyUnitsPerOneUsd, minStakeMajorForOneUsd } from '@/lib/exchangeRates';

/**
 * Paid-stake floor: at least US$1 worth in the user’s stake currency, using a live FX rate when available.
 */
export function useMinimumStakeMajor(currency: string) {
  const c = normalizeStakeCurrency(currency);
  const [minimumStake, setMinimumStake] = useState(() =>
    minStakeMajorForOneUsd(USD_TO_CURRENCY_RATE[c as StakeCurrency] ?? 1, c),
  );

  useEffect(() => {
    let cancelled = false;
    const staticMin = minStakeMajorForOneUsd(USD_TO_CURRENCY_RATE[c as StakeCurrency] ?? 1, c);
    setMinimumStake(staticMin);

    void (async () => {
      try {
        const units = await getCurrencyUnitsPerOneUsd(c);
        if (!cancelled) setMinimumStake(minStakeMajorForOneUsd(units, c));
      } catch {
        if (!cancelled) setMinimumStake(staticMin);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [c]);

  return { minimumStake, currency: c };
}
