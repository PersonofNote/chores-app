/**
 * Turns store changes into map effects and sound. Subscribing here (rather than
 * calling effects from each button) means every way of logging a chore, such as a
 * tap, the ring or the room checklist, gets the same restore.
 */
import { isFloorItem, type Id } from '../domain'
import type { HouseStore, StoreChange } from '../state/house-store'

export interface FeedbackEffects {
  restore(itemId: Id): void
  restoreFloor(roomId: Id): void
  skip(itemId: Id): void
}

export interface FeedbackSound {
  restore(): void
  skip(): void
}

export function connectFeedback(store: HouseStore, effects: FeedbackEffects, sound: FeedbackSound): () => void {
  return store.subscribe((change: StoreChange) => {
    if (change.kind !== 'events') return
    const restored = new Set<Id>()
    const floors = new Set<Id>()
    const skipped = new Set<Id>()
    for (const event of change.events) {
      const task = store.task(event.taskId)
      const item = task && store.item(task.itemId)
      if (!item) continue
      if (event.kind === 'done') (isFloorItem(item) ? floors.add(item.roomId) : restored.add(item.id))
      else if (event.kind === 'skip' && !isFloorItem(item)) skipped.add(item.id)
    }
    restored.forEach((id) => effects.restore(id))
    floors.forEach((id) => effects.restoreFloor(id))
    skipped.forEach((id) => effects.skip(id))
    // One sound per action, however many chores it logged.
    if (restored.size || floors.size) sound.restore()
    else if (change.events.some((e) => e.kind === 'skip')) sound.skip()
  })
}
