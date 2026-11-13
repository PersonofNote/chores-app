import type { ChoreOption } from '../chores'
import { intervalLabel, relativeDay } from '../format'
import { el } from '../components/sheet'

/** "Every week · last done 3 days ago" */
export function choreStatusText(o: ChoreOption, now: Date): string {
  const last = o.status ? `last done ${relativeDay(o.status.lastReset, now)}` : 'not logged yet'
  const every = intervalLabel(o.task.intervalDays)
  return `${every[0]!.toUpperCase()}${every.slice(1)} · ${last}`
}

/** A colored dot showing a chore's decay. */
export function choreDot(o: ChoreOption): HTMLSpanElement {
  const dot = el('span', { className: 'chore-dot', attrs: { 'aria-hidden': 'true' } })
  dot.style.setProperty('--chore-color', o.color)
  return dot
}
