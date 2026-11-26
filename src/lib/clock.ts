// Local date-formatting helpers matching DSH 0.2.2-rc.5 IconActions clocks (MIT, docs/dsh-ui-MIT.txt).

/** Subset of the host `chat` dictionary required to format message timestamps. */
export interface ClockTranslate {
  (key: 'clock.md' | 'clock.ymd', params?: Record<string, unknown>): string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local calendar-day epoch (ms at local midnight) for an instant. */
export function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Delay in milliseconds until the following local midnight after `ms` (at least 1ms). */
export function msUntilNextLocalMidnight(ms: number): number {
  const next = new Date(ms)
  next.setHours(24, 0, 0, 0)
  return Math.max(next.getTime() - ms, 1)
}

/**
 * Format a closing-note timestamp consistently with native IconActions rows.
 * Same calendar day renders `HH:mm`; earlier in the current year uses `clock.md`;
 * previous or future years use `clock.ymd`.
 */
export function formatMessageClock(time: number, t: ClockTranslate, now: number = Date.now()): string {
  const date = new Date(time)
  const reference = new Date(now)
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (
    date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate()
  ) {
    return clock
  }
  const params = { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
  const day = date.getFullYear() === reference.getFullYear() ? t('clock.md', params) : t('clock.ymd', params)
  return `${day} ${clock}`
}
