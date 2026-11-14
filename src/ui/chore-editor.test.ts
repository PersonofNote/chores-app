// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import type { Repository } from '../storage'
import { testApp } from './test-app'

let repo: Repository | undefined
afterEach(() => repo?.close())

async function app() {
  const a = await testApp()
  repo = a.repo
  const bed = a.itemOf('bed')
  const sheet = () => a.ui.sheet()
  const title = () => sheet()?.querySelector('h2')?.textContent
  const field = <T extends HTMLElement>(label: string) => sheet()!.querySelector<T>(`[aria-label="${label}"]`)!
  const choose = (label: string, value: string) => {
    const select = field<HTMLSelectElement>(label)
    select.value = value
    select.dispatchEvent(new Event('change'))
  }
  const type = (label: string, value: string) => (field<HTMLInputElement>(label).value = value)
  const names = () => a.store.tasksForItem(bed.id).map((t) => t.name)
  return { ...a, bed, title, field, choose, type, names }
}

describe('ChoreEditor', () => {
  it('opens from an item’s details', async () => {
    const a = await app()
    a.longPress({ kind: 'item', itemId: a.bed.id })
    a.click('Edit chores')
    expect(a.title()).toBe('Bed')
    expect(a.ui.sheet()!.querySelector('.sheet-subtitle')?.textContent).toBe('Chores')
    const rows = [...a.ui.sheet()!.querySelectorAll('.chore-row')].map((r) => r.getAttribute('aria-label'))
    expect(rows).toEqual(['Edit Wash sheets', 'Edit Rotate mattress'])
  })

  it('opens from the editor toolbar when an item is selected', async () => {
    const a = await app()
    a.editor.enter()
    a.editor.handle({ type: 'tap', target: { kind: 'item', itemId: a.bed.id }, point: { x: 0, y: 0 } })
    a.click('Chores')
    expect(a.title()).toBe('Bed')
  })

  it('adds a chore from a suggestion, seeded, then returns to the list', async () => {
    const a = await app()
    a.choreEditor.open(a.bed.id)
    a.click('Add chore')
    expect(a.title()).toBe('Add chore')
    // Chores the bed already has aren't suggested again.
    const chips = [...a.ui.sheet()!.querySelectorAll('.chip')].map((c) => c.textContent)
    expect(chips).not.toContain('Wash sheets')
    a.click('Wash duvet')
    expect(a.field<HTMLInputElement>('Chore name').value).toBe('Wash duvet')
    expect(a.field<HTMLSelectElement>('How often').value).toBe('90')
    a.click('This week')
    a.click('Add')
    await a.settle()

    const task = a.store.tasksForItem(a.bed.id).find((t) => t.name === 'Wash duvet')!
    expect(task.intervalDays).toBe(90)
    const status = a.store.status().tasks.get(task.id)
    expect(status?.stage).toBe('fresh')
    expect(a.title()).toBe('Bed')
    expect(a.ui.toast().textContent).toContain('Added Wash duvet')
  })

  it('adds a chore of your own with a custom interval', async () => {
    const a = await app()
    a.choreEditor.add(a.bed.id)
    a.type('Chore name', '  Air   out duvet ')
    a.choose('How often', 'custom')
    expect(a.field<HTMLInputElement>('Every how many days').closest('label')!.hidden).toBe(false)
    a.type('Every how many days', '10')
    a.click('Add')
    await a.settle()
    expect(a.store.tasksForItem(a.bed.id).find((t) => t.name === 'Air out duvet')?.intervalDays).toBe(10)
  })

  it('explains a problem inline and saves nothing', async () => {
    const a = await app()
    a.choreEditor.add(a.bed.id)
    a.type('Chore name', 'wash sheets')
    a.click('Add')
    await a.settle()
    expect(a.ui.sheet()!.querySelector('.sheet-error')!.textContent).toBe('There’s already a chore called “Wash sheets” here.')
    expect(a.names()).toEqual(['Wash sheets', 'Rotate mattress'])

    a.type('Chore name', 'Vacuum under bed')
    a.choose('How often', 'custom')
    a.type('Every how many days', '0')
    a.click('Add')
    expect(a.ui.sheet()!.querySelector('.sheet-error')!.textContent).toContain('How often must be')
  })

  it('renames a chore and changes how often, keeping its history', async () => {
    const a = await app()
    const sheets = a.store.tasksForItem(a.bed.id)[0]!
    a.choreEditor.open(a.bed.id)
    a.field<HTMLButtonElement>('Edit Wash sheets').click()
    expect(a.title()).toBe('Wash sheets')
    expect(a.field<HTMLSelectElement>('How often').value).toBe('7')
    a.type('Chore name', 'Change sheets')
    a.choose('How often', '14')
    a.click('Save')
    await a.settle()

    expect(a.store.task(sheets.id)).toMatchObject({ name: 'Change sheets', intervalDays: 14 })
    expect(a.store.history(a.bed.id).some((h) => h.task.id === sheets.id)).toBe(true)
    expect(a.title()).toBe('Bed')
  })

  it('shows a non-preset interval as Custom', async () => {
    const a = await app()
    const sheets = a.store.tasksForItem(a.bed.id)[0]!
    await a.store.updateTask({ ...sheets, intervalDays: 10 })
    a.choreEditor.edit(sheets.id)
    expect(a.field<HTMLSelectElement>('How often').value).toBe('custom')
    expect(a.field<HTMLInputElement>('Every how many days').value).toBe('10')
  })

  it('Cancel goes back to the list without saving', async () => {
    const a = await app()
    a.choreEditor.edit(a.store.tasksForItem(a.bed.id)[0]!.id)
    a.type('Chore name', 'Something else')
    a.click('Cancel')
    expect(a.title()).toBe('Bed')
    expect(a.names()).toEqual(['Wash sheets', 'Rotate mattress'])
  })

  it('removes a chore after confirming', async () => {
    const a = await app()
    a.choreEditor.edit(a.store.tasksForItem(a.bed.id)[1]!.id)
    a.click('Remove chore')
    expect(a.title()).toBe('Remove chore?')
    a.click('Remove')
    await a.settle()
    expect(a.names()).toEqual(['Wash sheets'])
    expect(a.title()).toBe('Bed')
    expect(a.ui.toast().textContent).toContain('Removed Rotate mattress')
  })

  it('closes an open ring when its item drops to one chore', async () => {
    const a = await app()
    a.tap({ kind: 'item', itemId: a.bed.id })
    expect(a.ui.ringButtons().length).toBeGreaterThan(0)
    await a.store.deleteTask(a.store.tasksForItem(a.bed.id)[1]!.id)
    expect(a.ui.ringButtons()).toHaveLength(0)
  })

  it('offers "Add chores" for an item with none', async () => {
    const a = await app()
    for (const t of a.store.tasksForItem(a.bed.id)) await a.store.deleteTask(t.id)
    a.longPress({ kind: 'item', itemId: a.bed.id })
    a.click('Add chores')
    expect(a.ui.sheet()!.textContent).toContain('No chores yet')
  })
})
