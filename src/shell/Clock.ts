import { useEffect, useState } from 'react';

/**
 * Current time, refreshed on the minute (or second) boundary and immediately when the tab becomes
 * visible again, so a suspended tab never shows a stale time.
 */
export function useNow(resolution: 'minute' | 'second'): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number | undefined;
    const unit = resolution === 'minute' ? 60_000 : 1000;
    const schedule = () => {
      const current = new Date();
      setNow(current);
      timer = window.setTimeout(schedule, unit - (current.getTime() % unit) + 15);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        schedule();
      }
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [resolution]);
  return now;
}

export function formatTrayTime(date: Date, format: '12h' | '24h' = '12h'): string {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  if (format === '24h') return `${String(h).padStart(2, '0')}:${m}`;
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}
