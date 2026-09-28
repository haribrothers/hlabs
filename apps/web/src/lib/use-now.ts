// The current time, refreshed every `everyMs` (a minute by default), for text that depends on the clock.
import { useEffect, useState } from 'react';

export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
