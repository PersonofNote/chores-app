/**
 * App bootstrap: open storage, load the house, mount the map, keep decay current.
 * Wiring only; behavior lives in domain, storage, state, render and ui.
 */
import { systemClock, uuid, type Clock } from './domain'
import { createDefaultSkins } from './render/default-skins'
import { MapEffects } from './render/effects'
import { MapView } from './render/map-view'
import { onUpdateAvailable } from './pwa/updates'
import { HouseStore } from './state/house-store'
import {
  backupFileName,
  createBackup,
  importBackup,
  openIdbRepository,
  parseBackup,
  requestPersistentStorage,
  restoreHouse,
  serializeBackup,
  type HouseData,
  type Repository,
} from './storage'
import { SheetHost, el } from './ui/components/sheet'
import { Toaster } from './ui/components/toast'
import { ChoreEditor } from './ui/chore-editor'
import { Editor } from './ui/editor/editor'
import { connectFeedback } from './ui/feedback'
import { GestureRecognizer } from './ui/gestures'
import { MapController } from './ui/map-controller'
import { Preferences } from './ui/preferences'
import { Settings, type BackupService } from './ui/settings'
import { Chimes } from './ui/sound'
import { watchPalette } from './ui/theme'
import { ViewportController } from './ui/viewport'
import { welcome } from './ui/welcome'

/** Minimum tap target, in CSS px. */
const MIN_TAP_PX = 44
/** Decay moves slowly; this just keeps a long-open tab honest. */
const REFRESH_MS = 5 * 60 * 1000
const DEFAULT_GRID = { w: 16, h: 12 }

export async function startApp(root: HTMLElement, clock: Clock = systemClock): Promise<void> {
  const repo = await openRepository()
  requestPersistentStorage().catch((err) => console.warn('Persistent storage request failed', err))

  let house = await loadFirstHouse(repo, clock)
  /** Set when the user just started a new house (not when they restored one). */
  let firstRun = false
  let restored = false
  if (!house) {
    const result = await welcome(root, { defaultGrid: DEFAULT_GRID, newId: uuid, restore: async (file) => restoreHouse(repo, parseBackup(await file.text())) })
    if (result.kind === 'new') {
      await repo.save({ homes: [result.home] })
      house = (await repo.loadHouse(result.home.id))!
      firstRun = true
    } else {
      house = result.house
      restored = true
    }
  }
  const store = new HouseStore(repo, house, { clock, newId: uuid })

  const skins = createDefaultSkins()
  const map = new MapView(skins)
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  root.replaceChildren(map.root, overlay)
  const sheets = new SheetHost(overlay)
  const toaster = new Toaster(overlay)
  const prefs = new Preferences()
  const backup = backupService(repo, clock)
  const settings = new Settings({ store, sheets, toaster, backup, prefs })

  const theme = watchPalette(() => refresh())
  const refresh = () => map.setStatus(store.status(), { palette: theme.palette(), config: store.config })
  /** Draws a house (the store's, or an editor preview) and everything layered on it. */
  const render = (data: Readonly<HouseData>) => {
    map.setHouse(data)
    map.setMinHitSize(MIN_TAP_PX / viewport.view.scale)
    refresh()
  }

  let editor: Editor | null = null
  let controller: MapController | null = null
  // Editing frames the whole grid; otherwise frame the rooms.
  const viewport = new ViewportController(map.root, map.content, () => (editor?.isActive ? map.contentBounds : map.roomsBounds), {
    onChange: (view) => {
      map.setMinHitSize(MIN_TAP_PX / view.scale)
      controller?.onViewChange()
      editor?.redraw()
    },
    claimsPointer: (e) => editor?.claims(e) ?? false,
  })
  const choreEditor = new ChoreEditor({ store, sheets, toaster, palette: theme.palette, clock, newId: uuid })
  const editChores = (itemId: string) => choreEditor.open(itemId)
  controller = new MapController({ store, map, overlay, view: () => viewport.view, palette: theme.palette, sheets, toaster, editChores })
  editor = new Editor({
    store,
    map,
    overlay,
    sheets,
    toaster,
    skins,
    view: () => viewport.view,
    render,
    editChores,
    openSettings: () => {
      controller?.dismiss()
      settings.open()
    },
    clock,
    newId: uuid,
    onModeChange: () => {
      controller?.dismiss()
      viewport.fit()
    },
  })

  let gridSize = store.house.home.gridSize
  store.subscribe((change) => {
    if (change.kind === 'layout') {
      render(store.house)
      const size = store.house.home.gridSize
      if (size.w !== gridSize.w || size.h !== gridSize.h) viewport.fit()
      gridSize = size
    } else {
      refresh()
    }
  })

  new GestureRecognizer(map.root, (g) => (editor?.isActive ? editor.handle(g) : controller?.handle(g)))
  connectFeedback(store, new MapEffects(map), new Chimes({ enabled: () => prefs.sound }))

  render(store.house)
  viewport.fit()
  editor.redraw()
  // Nothing to look at without rooms: open straight into the editor.
  if (firstRun || store.house.rooms.length === 0) editor.enter()
  if (restored) toaster.show(`Restored ${store.house.home.name}`)

  onUpdateAvailable((activate) => toaster.show('Update available', { label: 'Reload', run: activate }, { persist: true }))

  setInterval(refresh, REFRESH_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh()
  })
}

/** Dev only: `?empty` runs against a scratch database that starts fresh on every load. */
const scratchRun = import.meta.env.DEV && new URLSearchParams(location.search).has('empty')
const SCRATCH_DB = 'house-monitor-scratch'

async function openRepository(): Promise<Repository> {
  if (!scratchRun) return openIdbRepository()
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(SCRATCH_DB)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('Close other ?empty tabs and reload'))
  })
  return openIdbRepository({ name: SCRATCH_DB })
}

async function loadFirstHouse(repo: Repository, clock: Clock): Promise<HouseData | null> {
  let [home] = await repo.listHomes()
  // Dev builds start with a demo house; ?empty skips it to try first run.
  if (!home && import.meta.env.DEV && !scratchRun) {
    const { buildDemoHouse } = await import('./dev/demo-house')
    await repo.save(buildDemoHouse(clock, uuid))
    ;[home] = await repo.listHomes()
  }
  return home ? repo.loadHouse(home.id) : null
}

function backupService(repo: Repository, clock: Clock): BackupService {
  return {
    async exportFile() {
      const backup = await createBackup(repo, clock)
      const url = URL.createObjectURL(new Blob([serializeBackup(backup)], { type: 'application/json' }))
      const a = el('a', { attrs: { href: url, download: backupFileName(clock.now()) } })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    async importFile(file) {
      return importBackup(repo, parseBackup(await file.text()))
    },
  }
}
