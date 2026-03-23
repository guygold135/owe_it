import { useEffect, useState } from 'react';

const SHORT_DEADLINE_TESTING_KEY = 'oweit_allow_short_deadlines';
const SHORT_DEADLINE_TESTING_EVENT = 'oweit:allow-short-deadlines-changed';

function readStoredValue(): boolean {
  try {
    return window.localStorage.getItem(SHORT_DEADLINE_TESTING_KEY) === '1';
  } catch {
    return false;
  }
}

export function useShortDeadlineTesting() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(readStoredValue());

    const onStorage = (event: StorageEvent) => {
      if (event.key !== SHORT_DEADLINE_TESTING_KEY) return;
      setEnabled(readStoredValue());
    };
    const onInternalChange = () => {
      setEnabled(readStoredValue());
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(SHORT_DEADLINE_TESTING_EVENT, onInternalChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SHORT_DEADLINE_TESTING_EVENT, onInternalChange);
    };
  }, []);

  const setTestingEnabled = (next: boolean) => {
    setEnabled(next);
    try {
      window.localStorage.setItem(SHORT_DEADLINE_TESTING_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage failures.
    }
    window.dispatchEvent(new Event(SHORT_DEADLINE_TESTING_EVENT));
  };

  return { enabled, setEnabled: setTestingEnabled };
}

