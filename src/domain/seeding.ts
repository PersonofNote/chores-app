/**
 * Onboarding seeding: when an item is added, each task asks "last done?" and the
 * answer becomes a backdated 'seed' event. "No idea" picks a random point within one
 * interval, so a freshly entered house doesn't all come due on the same day.
 */
import { recordSeed, type EventDeps } from './events'
import { daysBefore, type Random } from './time'
import type { Id, Task, TaskEvent } from './types'

export type LastDoneAnswer = 'this-week' | 'this-month' | 'no-idea'

export const LAST_DONE_ANSWERS: readonly LastDoneAnswer[] = ['this-week', 'this-month', 'no-idea']

/** How many days ago to place the seed, for one answer. */
export function seedOffsetDays(answer: LastDoneAnswer, intervalDays: number, random: Random): number {
  switch (answer) {
    case 'this-week':
      return random() * 7
    case 'this-month':
      return 7 + random() * 23
    case 'no-idea':
      // Uniform pressure in [0, 1): spread out, and nothing starts overdue.
      return random() * intervalDays
  }
}

export interface SeedDeps extends EventDeps {
  random: Random
}

/** One seed event per answered task. Tasks without an answer are left unseeded. */
export function seedTasks(
  tasks: readonly Task[],
  answers: ReadonlyMap<Id, LastDoneAnswer>,
  deps: SeedDeps,
): TaskEvent[] {
  const now = deps.clock.now()
  const events: TaskEvent[] = []
  for (const task of tasks) {
    const answer = answers.get(task.id)
    if (!answer) continue
    const at = daysBefore(now, seedOffsetDays(answer, task.intervalDays, deps.random))
    events.push(recordSeed(task.id, at, deps))
  }
  return events
}
