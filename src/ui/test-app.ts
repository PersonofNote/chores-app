// A fully wired map UI over the demo house, for UI integration tests (happy-dom).
import { fixedClock, sequentialIds, type Task } from '../domain'
import { buildDemoHouse } from '../dev/demo-house'
import { LIGHT_PALETTE } from '../render/decay-style'
import { MapView } from '../render/map-view'
import { SkinRegistry } from '../render/skins'
import { HouseStore } from '../state/house-store'
import { openTestRepository } from '../storage/test-fixtures'
import { SheetHost } from './components/sheet'
import { Toaster } from './components/toast'
import type { HouseData } from '../storage'
import { Editor } from './editor/editor'
import { MapController } from './map-controller'

export async function testApp(opts: { extraTasks?: (data: ReturnType<typeof buildDemoHouse>) => Task[] } = {}) {
  const clock = fixedClock('2026-06-01T08:00:00.000Z')
  const newId = sequentialIds('t')
  const demo = buildDemoHouse(clock, newId)
  demo.tasks!.push(...(opts.extraTasks?.(demo) ?? []))
  const repo = await openTestRepository()
  await repo.save(demo)
  const house = (await repo.loadHouse(demo.homes![0]!.id))!
  const store = new HouseStore(repo, house, { clock, newId })

  const map = new MapView(new SkinRegistry())
  map.setHouse(house)
  const overlay = document.createElement('div')
  document.body.replaceChildren(map.root, overlay)
  const sheets = new SheetHost(overlay)
  const toaster = new Toaster(overlay)
  const view = () => ({ scale: 1, tx: 0, ty: 0 })
  const controller = new MapController({ store, map, overlay, view, palette: () => LIGHT_PALETTE, sheets, toaster })
  const render = (data: Readonly<HouseData>) => {
    map.setHouse(data)
    map.setStatus(store.status(), { palette: LIGHT_PALETTE })
  }
  store.subscribe((c) => c.kind === 'layout' && render(store.house))
  const editor = new Editor({
    store, map, overlay, sheets, toaster, view, render, clock, newId,
    skins: new SkinRegistry(),
    random: () => 0.5,
    backup: { exportFile: async () => {}, importFile: async () => { throw new Error('not in tests') } },
  })

  const itemOf = (type: string) => house.items.find((i) => i.type === type)!
  const roomOf = (name: string) => house.rooms.find((r) => r.name === name)!
  const ui = {
    toast: () => overlay.querySelector<HTMLElement>('.toast')!,
    ringButtons: () => [...overlay.querySelectorAll<HTMLButtonElement>('.chore-ring-button')],
    sheet: () => overlay.querySelector<HTMLDialogElement>('dialog.sheet'),
  }
  const point = { x: 0, y: 0 }
  const tap = (target: Parameters<MapController['handle']>[0]['target']) => controller.handle({ type: 'tap', target, point })
  const longPress = (target: NonNullable<Parameters<MapController['handle']>[0]['target']>) =>
    controller.handle({ type: 'long-press', target, point })
  /** Lets the store's async writes (fake IndexedDB) settle. */
  const settle = () => new Promise((r) => setTimeout(r, 20))

  /** Clicks the button with this exact text, preferring an open sheet. */
  const click = (text: string) => {
    const scope = overlay.querySelector('dialog.sheet') ?? overlay
    const b = [...scope.querySelectorAll<HTMLElement>('button, label')].find((x) => x.textContent?.trim() === text)
    if (!b) throw new Error(`No button '${text}'`)
    b.click()
  }

  return { store, map, overlay, controller, editor, repo, clock, itemOf, roomOf, ui, tap, longPress, settle, click }
}
