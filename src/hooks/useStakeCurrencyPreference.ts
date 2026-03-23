import { useEffect, useState } from 'react';
import { DEFAULT_STAKE_CURRENCY, normalizeStakeCurrency, type StakeCurrency } from '@/lib/currency';

const STAKE_CURRENCY_KEY = 'oweit_stake_currency';
const STAKE_CURRENCY_CHANGED_EVENT = 'oweit:stake-currency-changed';

function readStoredStakeCurrency(): StakeCurrency {
  try {
    return normalizeStakeCurrency(window.localStorage.getItem(STAKE_CURRENCY_KEY));
  } catch {
    return DEFAULT_STAKE_CURRENCY;
  }
}

export function useStakeCurrencyPreference() {
  const [currency, setCurrency] = useState<StakeCurrency>(DEFAULT_STAKE_CURRENCY);

  useEffect(() => {
    setCurrency(readStoredStakeCurrency());

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STAKE_CURRENCY_KEY) return;
      setCurrency(readStoredStakeCurrency());
    };
    const onInternalChange = () => {
      setCurrency(readStoredStakeCurrency());
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(STAKE_CURRENCY_CHANGED_EVENT, onInternalChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STAKE_CURRENCY_CHANGED_EVENT, onInternalChange);
    };
  }, []);

  const updateCurrency = (next: StakeCurrency) => {
    const normalized = normalizeStakeCurrency(next);
    setCurrency(normalized);
    try {
      window.localStorage.setItem(STAKE_CURRENCY_KEY, normalized);
    } catch {
      // Ignore storage failures (private mode / quota).
    }
    window.dispatchEvent(new Event(STAKE_CURRENCY_CHANGED_EVENT));
  };

  return { currency, setCurrency: updateCurrency };
}

