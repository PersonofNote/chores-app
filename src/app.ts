/**
 * App bootstrap: open storage, load the house, mount the map, keep decay current.
 * Wiring only; behavior lives in domain, storage, state, render and ui.
 */
import { systemClock, uuid, type Clock } from './domain'
import { createDefaultSkins } from './render/default-skins'
import { MapEffects } from './render/effects'
import { MapView } from './render/map-view'
import { HouseStore } from './state/house-store'
import { openIdbRepository, requestPersistentStorage, type HouseData, type Repository } from './storage'
import { connectFeedback } from './ui/feedback'
import { GestureRecognizer } from './ui/gestures'
import { MapController } from './ui/map-controller'
import { Chimes } from './ui/sound'
import { watchPalette } from './ui/theme'
import { ViewportController } from './ui/viewport'

/** Minimum tap target, in CSS px. */
const MIN_TAP_PX = 44
/** Decay moves slowly; this just keeps a long-open tab honest. */
const REFRESH_MS = 5 * 60 * 1000

export async function startApp(root: HTMLElement, clock: Clock = systemClock): Promise<void> {
  const repo = await openIdbRepository()
  requestPersistentStorage().catch((err) => console.warn('Persistent storage request failed', err))

  const house = await loadFirstHouse(repo, clock)
  if (!house) {
    root.replaceChildren(emptyState())
    return
  }
  const store = new HouseStore(repo, house, { clock, newId: uuid })

  const map = new MapView(createDefaultSkins())
  map.setHouse(house)
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  root.replaceChildren(map.root, overlay)

  const theme = watchPalette(() => refresh())
  const refresh = () => map.setStatus(store.status(), { palette: theme.palette(), config: store.config })
  store.subscribe(refresh)

  let controller: MapController | null = null
  const viewport = new ViewportController(map.root, map.content, () => map.contentBounds, {
    onChange: (view) => {
      map.setMinHitSize(MIN_TAP_PX / view.scale)
      controller?.onViewChange()
    },
  })
  controller = new MapController({
    store,
    map,
    overlay,
    view: () => viewport.view,
    palette: theme.palette,
  })
  new GestureRecognizer(map.root, (g) => controller.handle(g))
  connectFeedback(store, new MapEffects(map), new Chimes())

  viewport.fit()
  refresh()

  setInterval(refresh, REFRESH_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh()
  })
}

async function loadFirstHouse(repo: Repository, clock: Clock): Promise<HouseData | null> {
  let [home] = await repo.listHomes()
  if (!home && import.meta.env.DEV) {
    const { buildDemoHouse } = await import('./dev/demo-house')
    await repo.save(buildDemoHouse(clock, uuid))
    ;[home] = await repo.listHomes()
  }
  return home ? repo.loadHouse(home.id) : null
}

function emptyState(): HTMLElement {
  const el = document.createElement('p')
  el.className = 'empty-state'
  el.textContent = 'No house yet. Drawing your floorplan arrives with the editor.'
  return el
}
