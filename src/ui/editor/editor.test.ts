// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repository } from '../../storage'
import { CELL } from '../../render/geometry'
import { SkinRegistry } from '../../render/skins'
import { svg } from '../../render/svg'
import { testApp } from '../test-app'

let repo: Repository | undefined
afterEach(() => repo?.close())

async function app(opts: Parameters<typeof testApp>[0] = {}) {
  const a = await testApp(opts)
  repo = a.repo
  // Room to grow: the demo house fills its 14 × 10 grid.
  await a.store.updateHome({ ...a.store.house.home, gridSize: { w: 20, h: 10 } })
  a.editor.enter()
  return a
}

const closeSheet = (overlay: HTMLElement) => overlay.querySelector<HTMLButtonElement>('dialog.sheet .sheet-close')!.click()

describe('Editor', () => {
  it('entering shows the grid and the toolbar; exiting hides them', async () => {
    const a = await app()
    expect(a.map.root.classList.contains('editing')).toBe(true)
    expect(a.overlay.querySelector<HTMLElement>('.editor-toolbar')!.hidden).toBe(false)
    a.editor.exit()
    expect(a.map.root.classList.contains('editing')).toBe(false)
    expect(a.overlay.querySelector<HTMLElement>('.mode-bar')!.hidden).toBe(false)
  })

  it('adds a room with a floor, then seeds its chores even if the prompt is just closed', async () => {
    const a = await app()
    a.click('Add room')
    const name = a.overlay.querySelector<HTMLInputElement>('dialog.sheet input')!
    name.value = 'Office'
    name.dispatchEvent(new Event('input'))
    a.click('Add room')
    await a.settle()

    const office = a.store.house.rooms.find((r) => r.name === 'Office')!
    expect(office.cells[0]).toMatchObject({ w: 4, h: 3 })
    expect(a.editor.selected).toEqual({ kind: 'room', roomId: office.id, rectIndex: 0 })
    const floor = a.store.itemsInRoom(office.id).find((i) => i.type === 'floor')!
    expect(a.ui.sheet()?.querySelector('h2')?.textContent).toBe('Office floor')

    closeSheet(a.overlay)
    await a.settle()
    const tasks = a.store.tasksForItem(floor.id)
    const status = a.store.status()
    expect(tasks.every((t) => status.tasks.get(t.id) !== null)).toBe(true)
  })

  it('adds an item from the picker into the selected room, honoring "This week"', async () => {
    const a = await app()
    const bedroom = a.roomOf('Bedroom')
    a.editor.select({ kind: 'room', roomId: bedroom.id, rectIndex: 0 })
    a.click('Add item')
    a.overlay.querySelector<HTMLButtonElement>('.picker-tile[aria-label="Plant"]')!.click()
    await a.settle()

    const plants = a.store.itemsInRoom(bedroom.id).filter((i) => i.type === 'plant')
    expect(plants).toHaveLength(2)
    const added = plants.find((p) => a.editor.selected?.kind === 'item' && p.id === a.editor.selected.itemId)!
    a.click('This week')
    a.click('Save')
    await a.settle()
    const [water] = a.store.tasksForItem(added.id)
    const daysAgo = a.store.status().tasks.get(water!.id)!.elapsedDays
    expect(daysAgo).toBeGreaterThanOrEqual(0)
    expect(daysAgo).toBeLessThan(7)
    expect(a.store.house.events.filter((e) => e.taskId === water!.id)).toHaveLength(1)
  })

  it('tapping selects; rotating keeps the item valid', async () => {
    const a = await app()
    const sofa = a.store.house.items.find((i) => i.type === 'sofa' && i.rotation === 0)!
    a.editor.handle({ type: 'tap', target: { kind: 'item', itemId: sofa.id }, point: { x: 0, y: 0 } })
    expect(a.editor.selected).toEqual({ kind: 'item', itemId: sofa.id })
    a.click('Rotate')
    await a.settle()
    expect(a.store.item(sofa.id)?.rotation).toBe(90)
    a.editor.handle({ type: 'tap', target: null, point: { x: 0, y: 0 } })
    expect(a.editor.selected).toBeNull()
  })

  it('deleting asks first, and Cancel keeps everything', async () => {
    const a = await app()
    const kitchen = a.roomOf('Kitchen')
    a.editor.select({ kind: 'room', roomId: kitchen.id, rectIndex: 0 })
    a.click('Delete')
    expect(a.ui.sheet()?.textContent).toMatch(/Delete Kitchen and the 4 items in it\?/)
    a.click('Cancel')
    expect(a.store.house.rooms.some((r) => r.id === kitchen.id)).toBe(true)

    a.click('Delete')
    a.click('Delete')
    // Wait for the result, not a fixed time: the cascade is a real (fake-IndexedDB) write.
    await vi.waitFor(() => expect(a.store.house.rooms.some((r) => r.id === kitchen.id)).toBe(false))
    expect(a.editor.selected).toBeNull()
  })

  it('adds and removes a section (L-shapes)', async () => {
    const a = await app()
    // The kitchen (already an L of 2 sections) has free grid to its right.
    const kitchen = a.roomOf('Kitchen')
    a.editor.select({ kind: 'room', roomId: kitchen.id, rectIndex: 0 })
    a.click('Add section')
    await a.settle()
    const cells = () => a.store.house.rooms.find((r) => r.id === kitchen.id)!.cells
    expect(cells()).toHaveLength(3)
    expect(cells()[2]).toEqual({ x: 14, y: 0, w: 2, h: 2 })
    expect(a.editor.selected).toEqual({ kind: 'room', roomId: kitchen.id, rectIndex: 2 })
    a.click('Remove section')
    await a.settle()
    expect(cells()).toHaveLength(2)
  })

  it('says so when there is no room for a section', async () => {
    const a = await app()
    const living = a.roomOf('Living room') // boxed in by the bedroom, kitchen and grid edge
    a.editor.select({ kind: 'room', roomId: living.id, rectIndex: 0 })
    a.click('Add section')
    await a.settle()
    expect(a.ui.toast().textContent).toMatch(/No space beside this room/)
  })

  it('claims only presses on the selected thing (so other drags still pan)', async () => {
    const a = await app()
    const bed = a.itemOf('bed')
    const hit = a.map.layers.ui.querySelector(`.hit[data-item-id="${bed.id}"]`)!
    const press = (target: Element) => ({ target }) as unknown as PointerEvent
    expect(a.editor.claims(press(hit))).toBe(false)
    a.editor.select({ kind: 'item', itemId: bed.id })
    expect(a.editor.claims(press(hit))).toBe(true)
    expect(a.editor.claims(press(a.map.layers.floor.querySelector('.room-floor rect')!))).toBe(false)

    a.editor.select({ kind: 'room', roomId: bed.roomId, rectIndex: 0 })
    expect(a.editor.claims(press(a.map.layers.ui.querySelector('.handle-dot')!))).toBe(true)
    expect(a.editor.claims(press(a.map.layers.floor.querySelector(`.room-floor[data-room-id="${bed.roomId}"] rect`)!))).toBe(true)
  })

  it('resizes a selected item by dragging a corner handle', async () => {
    const a = await app()
    const bed = a.itemOf('bed') // 2 × 2 at (1, 1) in the 5 × 5 bedroom; a plant sits at (4, 4)
    a.editor.select({ kind: 'item', itemId: bed.id })
    const handles = a.map.layers.ui.querySelectorAll('.editor-overlay .handle')
    expect(handles).toHaveLength(4)
    const se = a.map.layers.ui.querySelector('.editor-overlay .handle[data-corner="se"] .handle-hit')!
    expect(a.editor.claims({ target: se } as unknown as PointerEvent)).toBe(true)

    const fire = (el: Element, type: string, x: number, y: number) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }))
    // The test view is 1:1, so one cell is CELL px; start at the bed's bottom-right corner.
    const start = (1 + 2) * CELL
    fire(se, 'pointerdown', start, start)
    fire(a.map.root, 'pointermove', start + CELL, start + CELL)
    fire(a.map.root, 'pointerup', start + CELL, start + CELL)
    await a.settle()
    expect(a.store.item(bed.id)).toMatchObject({ cell: { x: 1, y: 1 }, size: { w: 3, h: 3 } })

    // One more cell would cover the plant: nothing is saved.
    const corner = a.map.layers.ui.querySelector('.editor-overlay .handle[data-corner="se"] .handle-hit')!
    fire(corner, 'pointerdown', start + CELL, start + CELL)
    fire(a.map.root, 'pointermove', start + 2 * CELL, start + 2 * CELL)
    fire(a.map.root, 'pointerup', start + 2 * CELL, start + 2 * CELL)
    await a.settle()
    expect(a.store.item(bed.id)!.size).toEqual({ w: 3, h: 3 })
  })

  it('renames a selected item, and clearing the name goes back to its type', async () => {
    const a = await app()
    const bed = a.itemOf('bed')
    a.editor.select({ kind: 'item', itemId: bed.id })
    a.click('Rename')
    const input = () => a.ui.sheet()!.querySelector<HTMLInputElement>('[aria-label="Item name"]')!
    expect(input().placeholder).toBe('Bed')
    input().value = 'Guest bed'
    a.click('Save')
    await vi.waitFor(() => expect(a.store.item(bed.id)?.name).toBe('Guest bed'))
    expect(a.ui.sheet()).toBeNull()
    expect(a.overlay.querySelector('.toolbar-label strong')?.textContent).toBe('Guest bed')
    expect(a.map.layers.ui.querySelector(`.hit[data-item-id="${bed.id}"]`)?.getAttribute('aria-label')).toBe('Guest bed')

    a.click('Rename')
    expect(input().value).toBe('Guest bed')
    input().value = ''
    a.click('Save')
    await vi.waitFor(() => expect(a.overlay.querySelector('.toolbar-label strong')?.textContent).toBe('Bed'))
  })

  it('picks a look for an item: saved, redrawn, and new items start on the first art look', async () => {
    const skins = new SkinRegistry()
      .register('bed.icon', () => svg('g', { class: 'bed-icon' }))
      .register('bed.quilt', () => svg('g', { class: 'bed-quilt' }), { outline: true })
      .register('sofa.icon', () => svg('g'))
    const a = await app({ skins })
    const bed = a.itemOf('bed')
    expect(a.map.itemBody(bed.id)!.querySelector('.bed-icon')).not.toBeNull()

    // Only types with more than one look get the button.
    a.editor.select({ kind: 'item', itemId: a.itemOf('sofa').id })
    expect(() => a.click('Look')).toThrow()

    a.editor.select({ kind: 'item', itemId: bed.id })
    a.click('Look')
    const tiles = [...a.ui.sheet()!.querySelectorAll<HTMLButtonElement>('.picker-tile')]
    expect(tiles.map((t) => [t.getAttribute('aria-label'), t.getAttribute('aria-pressed')])).toEqual([
      ['Quilt', 'false'],
      ['Simple icon', 'true'],
    ])
    tiles[0]!.click()
    await vi.waitFor(() => expect(a.store.item(bed.id)?.skin).toBe('bed.quilt'))
    expect(a.map.itemBody(bed.id)!.querySelector('.bed-quilt')).not.toBeNull()
    expect(a.map.itemBody(bed.id)!.querySelector('.item-outline')).not.toBeNull()

    a.editor.select({ kind: 'room', roomId: a.roomOf('Bedroom').id, rectIndex: 0 })
    a.click('Add item')
    a.overlay.querySelector<HTMLButtonElement>('.picker-tile[aria-label="Bed"]')?.click()
    await a.settle()
    const added = a.store.house.items.filter((i) => i.type === 'bed' && i.id !== bed.id)
    expect(added.map((i) => i.skin)).toEqual(['bed.quilt'])
  })

  it('a selected room offers its floor chores', async () => {
    const a = await app()
    const bedroom = a.roomOf('Bedroom')
    a.editor.select({ kind: 'room', roomId: bedroom.id, rectIndex: 0 })
    a.click('Floor chores')
    expect(a.ui.sheet()!.querySelector('h2')?.textContent).toBe('Bedroom floor')
    expect(a.ui.sheet()!.textContent).toMatch(/Vacuum|Mop/)
  })

  it('reports layout problems instead of saving them', async () => {
    const a = await app()
    await a.store.updateHome({ ...a.store.house.home, gridSize: { w: 14, h: 10 } })
    a.editor.select(null)
    a.click('Add room')
    a.click('Bedroom')
    a.click('Add room')
    await a.settle()
    expect(a.ui.toast().textContent).toMatch(/no free space/i)
  })
})
