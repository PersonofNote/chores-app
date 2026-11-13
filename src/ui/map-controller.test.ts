// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import type { Repository } from '../storage'
import { testApp } from './test-app'

let repo: Repository | undefined
afterEach(() => repo?.close())

async function app(...args: Parameters<typeof testApp>) {
  const a = await testApp(...args)
  repo = a.repo
  return a
}

describe('MapController gestures', () => {
  it('tapping a one-chore item logs it with an Undo toast; Undo voids it', async () => {
    const a = await app()
    const toilet = a.itemOf('toilet')
    const [task] = a.store.tasksForItem(toilet.id)
    a.tap({ kind: 'item', itemId: toilet.id })
    await a.settle()
    expect(a.store.status().tasks.get(task!.id)?.stage).toBe('fresh')
    expect(a.ui.toast().textContent).toBe('Clean toilet: doneUndo')

    a.ui.toast().querySelector('button')!.click()
    await a.settle()
    expect(a.store.status().tasks.get(task!.id)?.stage).not.toBe('fresh')
    expect(a.ui.toast().textContent).toBe('Undone')
  })

  it('tapping a multi-chore item opens a ring, worst first, without logging anything', async () => {
    const a = await app()
    const bed = a.itemOf('bed')
    const before = a.store.house.events.length
    a.tap({ kind: 'item', itemId: bed.id })
    const names = a.ui.ringButtons().map((b) => b.textContent)
    const expected = a.store
      .tasksForItem(bed.id)
      .sort((x, y) => a.store.status().tasks.get(y.id)!.pressure - a.store.status().tasks.get(x.id)!.pressure)
      .map((t) => t.name)
    expect(names).toEqual(expected)
    expect(a.store.house.events.length).toBe(before)
  })

  it('picking from the ring logs that chore and keeps the ring open, restyled', async () => {
    const a = await app()
    a.tap({ kind: 'item', itemId: a.itemOf('bed').id })
    const first = a.ui.ringButtons()[0]!
    first.click()
    await a.settle()
    expect(a.ui.ringButtons()).toHaveLength(2)
    expect(first.dataset.stage).toBe('fresh')
  })

  it('while the ring is open, any tap (even on empty space) only closes it', async () => {
    const a = await app()
    const before = a.store.house.events.length
    a.tap({ kind: 'item', itemId: a.itemOf('bed').id })
    a.tap(null)
    expect(a.ui.ringButtons()).toHaveLength(0)
    a.tap({ kind: 'item', itemId: a.itemOf('bed').id })
    a.tap({ kind: 'item', itemId: a.itemOf('toilet').id })
    await a.settle()
    expect(a.ui.ringButtons()).toHaveLength(0)
    expect(a.store.house.events.length).toBe(before)
  })

  it('an item with 6+ chores opens a list sheet instead of a ring', async () => {
    const a = await app({
      extraTasks: (demo) => {
        const fridge = demo.items!.find((i) => i.type === 'fridge')!
        return [3, 4, 5, 6].map((n) => ({ id: `extra-${n}`, itemId: fridge.id, name: `Extra ${n}`, intervalDays: 30, kind: 'interval' as const }))
      },
    })
    a.tap({ kind: 'item', itemId: a.itemOf('fridge').id })
    expect(a.ui.ringButtons()).toHaveLength(0)
    expect(a.ui.sheet()?.querySelectorAll('.chore-row')).toHaveLength(6)
  })

  it('tapping the floor opens the floor chores', async () => {
    const a = await app()
    a.tap({ kind: 'floor', roomId: a.roomOf('Kitchen').id })
    expect(a.ui.ringButtons().map((b) => b.textContent).sort()).toEqual(['Mop', 'Vacuum'])
  })

  it('the room checklist lists due chores pre-checked and logs the checked ones', async () => {
    const a = await app()
    const kitchen = a.roomOf('Kitchen')
    a.tap({ kind: 'room-label', roomId: kitchen.id })
    const boxes = [...a.ui.sheet()!.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    const status = a.store.status()
    const dueInKitchen = a.store
      .itemsInRoom(kitchen.id)
      .flatMap((i) => a.store.tasksForItem(i.id))
      .filter((t) => status.tasks.get(t.id)!.pressure >= a.store.config.thresholds.dueSoon)
    expect(boxes).toHaveLength(dueInKitchen.length)
    expect(boxes.every((b) => b.checked)).toBe(true)

    boxes[0]!.checked = false
    boxes[0]!.dispatchEvent(new Event('change', { bubbles: true }))
    const confirm = a.ui.sheet()!.querySelector<HTMLButtonElement>('.sheet-button.primary')!
    expect(confirm.textContent).toBe(`Log ${boxes.length - 1} chores`)
    const before = a.store.house.events.length
    confirm.click()
    await a.settle()
    expect(a.store.house.events.length).toBe(before + boxes.length - 1)
    expect(a.ui.sheet()).toBeNull()
    expect(a.ui.toast().textContent).toBe(`Kitchen: ${boxes.length - 1} chores doneUndo`)
  })

  it('long-press opens details with notes and history', async () => {
    const a = await app()
    const bed = a.itemOf('bed')
    a.longPress({ kind: 'item', itemId: bed.id })
    const sheet = a.ui.sheet()!
    expect(sheet.querySelector('h2')?.textContent).toBe('Bed')
    expect(sheet.querySelector('textarea.notes')).not.toBeNull()
    expect(sheet.querySelectorAll('.history-row')).toHaveLength(2) // the two seeds
  })

  it('notes save on blur', async () => {
    const a = await app()
    const bed = a.itemOf('bed')
    a.longPress({ kind: 'item', itemId: bed.id })
    const notes = a.ui.sheet()!.querySelector<HTMLTextAreaElement>('textarea.notes')!
    notes.value = 'Queen, memory foam'
    notes.dispatchEvent(new Event('blur'))
    await a.settle()
    expect(a.store.item(bed.id)?.notes).toBe('Queen, memory foam')
  })
})
