/** Human-facing formatting, pure. Days are local calendar days. */
import { MS_PER_DAY } from '../domain'

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Whole calendar days from `date` to `now` (0 = same day). */
export function calendarDaysAgo(date: Date, now: Date): number {
  return Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / MS_PER_DAY)
}

export function relativeDay(date: Date, now: Date): string {
  const days = calendarDaysAgo(date, now)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  if (days < 365 * 2) return `${Math.round(days / 30)} months ago`
  return `${Math.round(days / 365)} years ago`
}

export function shortDate(date: Date, now: Date): string {
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

const NAMED_INTERVALS: Record<number, string> = {
  1: 'every day',
  7: 'every week',
  14: 'every 2 weeks',
  30: 'every month',
  90: 'every 3 months',
  180: 'every 6 months',
  365: 'every year',
}

export function intervalLabel(days: number): string {
  return NAMED_INTERVALS[days] ?? `every ${days} days`
}

/** `YYYY-MM-DD` for a date input, local time. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * When a "done earlier" date from a date input happened: local midday of that day,
 * or now if that's still ahead (picking today). Null for invalid or future dates.
 */
export function dateFromInput(value: string, now: Date): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  if (Number.isNaN(day.getTime()) || calendarDaysAgo(day, now) < 0) return null
  return day.getTime() > now.getTime() ? now : day
}
