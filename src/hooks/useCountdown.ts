import { useEffect, useState } from 'react';

/** `within6h` / `within24h` drive copy + styling; `none` is normal countdown. */
export type DeadlineUrgency = 'none' | 'within24h' | 'within6h';

export function useCountdown(deadline: Date) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(deadline));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(deadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return timeLeft;
}

function getTimeLeft(deadline: Date) {
  const diff = Math.max(0, deadline.getTime() - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const within6h = diff < 6 * 60 * 60 * 1000;
  const within24h = diff < 24 * 60 * 60 * 1000;
  let urgency: DeadlineUrgency = 'none';
  if (within6h) urgency = 'within6h';
  else if (within24h) urgency = 'within24h';
  const isUrgent = within6h;
  const isExpired = diff === 0;

  return { days, hours, minutes, seconds, isUrgent, isExpired, totalMs: diff, urgency };
}
