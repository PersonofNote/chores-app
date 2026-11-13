// A fully wired map UI over the demo house, for UI integration tests (happy-dom).
import { fixedClock, sequentialIds, type Task } from '../domain'
import { buildDemoHouse } from '../dev/demo-house'
import { LIGHT_PALETTE } from '../render/decay-style'
import { MapView } from '../render/map-view'
import { SkinRegistry } from '../render/skins'
import { HouseStore } from '../state/house-store'
import { openTestRepository } from '../storage/test-fixtures'
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
  const controller = new MapController({
    store,
    map,
    overlay,
    view: () => ({ scale: 1, tx: 0, ty: 0 }),
    palette: () => LIGHT_PALETTE,
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

  return { store, map, overlay, controller, repo, clock, itemOf, roomOf, ui, tap, longPress, settle }
}
