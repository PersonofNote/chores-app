/**
 * Rules for editing an item's chores, pure. The chore editor proposes a name and
 * interval; these decide whether it's allowed, and `HouseStore` re-checks before saving.
 */
import { choreNameKey } from './library'
import type { Task } from './types'

/** Ten years: anything rarer isn't a chore worth decaying. */
export const MAX_INTERVAL_DAYS = 3650

export type ChoreProblem =
  | { kind: 'empty-name' }
  | { kind: 'bad-interval' }
  /** The item already has a chore by this name. */
  | { kind: 'duplicate-name'; name: string }

/**
 * Checks a chore (new, or an edited version of one of `siblings`) against the other
 * chores on its item.
 */
export function checkChore(chore: Pick<Task, 'id' | 'name' | 'intervalDays'>, siblings: readonly Task[]): ChoreProblem | null {
  const key = choreNameKey(chore.name)
  if (!key) return { kind: 'empty-name' }
  if (!Number.isInteger(chore.intervalDays) || chore.intervalDays < 1 || chore.intervalDays > MAX_INTERVAL_DAYS) {
    return { kind: 'bad-interval' }
  }
  const twin = siblings.find((t) => t.id !== chore.id && choreNameKey(t.name) === key)
  return twin ? { kind: 'duplicate-name', name: twin.name } : null
}

/** A chore name as stored: trimmed, inner runs of spaces collapsed. Case is kept. */
export const tidyChoreName = (name: string) => name.trim().replace(/\s+/g, ' ')

export function describeChoreProblem(p: ChoreProblem): string {
  switch (p.kind) {
    case 'empty-name':
      return 'Give the chore a name.'
    case 'bad-interval':
      return `How often must be 1–${MAX_INTERVAL_DAYS} days.`
    case 'duplicate-name':
      return `There’s already a chore called “${p.name}” here.`
  }
}
