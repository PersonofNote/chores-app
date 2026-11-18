/**
 * Dev-only art gallery (`?art`): every art look at every stage and at several sizes,
 * rotated and not, drawn by the real `MapView` with decay overlays. This is where new
 * drawings get checked. Switch the OS theme for dark mode, or screenshot both with
 * `npm run screenshot -- "http://localhost:5173/?art" out.png dark`.
 *
 * With no art yet it shows icon looks, so the overlays can still be judged.
 */
import {
  defaultLibrary,
  STAGES,
  stageFor,
  type DecayStatus,
  type HouseStatus,
  type Item,
  type Room,
  type Rotation,
  type Stage,
} from '../domain'
import { bundledArtLooks } from '../render/art'
import { DARK_PALETTE, LIGHT_PALETTE } from '../render/decay-style'
import { createDefaultSkins } from '../render/default-skins'
import { CELL } from '../render/geometry'
import { MapView } from '../render/map-view'
import { svg } from '../render/svg'
import { el } from '../ui/components/sheet'

/** A pressure inside each stage, so the decay color matches the stage too. */
const PRESSURE: Record<Stage, number> = { fresh: 0.2, fine: 0.6, 'due-soon': 0.9, overdue: 1.3, neglected: 2 }
const SIZES: readonly { w: number; h: number; rotation: Rotation }[] = [
  { w: 1, h: 1, rotation: 0 },
  { w: 2, h: 1, rotation: 0 },
  { w: 2, h: 1, rotation: 90 },
  { w: 2, h: 2, rotation: 0 },
  { w: 3, h: 2, rotation: 0 },
  { w: 4, h: 1, rotation: 0 },
]
const FALLBACK_LOOKS = ['bed.icon', 'counter.icon', 'plant.icon']
const ZOOMS = [25, 50] as const

export function showArtGallery(root: HTMLElement): void {
  const skins = createDefaultSkins()
  const art = bundledArtLooks().map((l) => l.key)
  const keys = art.length ? art : FALLBACK_LOOKS
  const dark = matchMedia('(prefers-color-scheme: dark)')
  const views: { map: MapView; status: HouseStatus }[] = []
  const restyle = () => {
    for (const { map, status } of views) map.setStatus(status, { palette: dark.matches ? DARK_PALETTE : LIGHT_PALETTE })
  }
  dark.addEventListener('change', restyle)

  const zoomButtons = ZOOMS.map((z) =>
    el('button', { className: 'chip', text: `${z} px per cell`, attrs: { type: 'button', 'data-zoom': String(z) } }),
  )
  const setZoom = (z: number) => {
    root.style.setProperty('--gallery-px', String(z / CELL))
    for (const b of zoomButtons) b.setAttribute('aria-pressed', String(b.dataset.zoom === String(z)))
  }
  zoomButtons.forEach((b) => b.addEventListener('click', () => setZoom(Number(b.dataset.zoom))))

  const sections = keys.map((key) => {
    const skin = skins.skinFor({ skin: key, type: key.split('.')[0]! })
    const { map, status } = lookSheet(skins, key)
    views.push({ map, status })
    return el('section', { className: 'gallery-look' }, [
      el('h2', { text: `${key} · ${skin.label}${skin.stageAware ? ' · stage-aware' : ''}` }),
      map.root,
    ])
  })

  root.replaceChildren(
    el('div', { className: 'gallery' }, [
      el('header', {}, [
        el('h1', { text: 'Art gallery' }),
        el('p', {
          text: art.length
            ? `${art.length} look${art.length === 1 ? '' : 's'}. Top row: each stage. Below: sizes, at Overdue.`
            : 'No art yet, so these are icons. Add src/render/art/<type>/<look>.svg (templates in art/templates/).',
        }),
        el('div', { className: 'chips' }, zoomButtons),
      ]),
      ...sections,
    ]),
  )
  document.title = 'Art gallery'
  setZoom(ZOOMS[0])
  restyle()
}

/** One look: a row of stages at the type's library size, then a row of sizes. */
function lookSheet(skins: ReturnType<typeof createDefaultSkins>, key: string): { map: MapView; status: HouseStatus } {
  const type = key.slice(0, key.lastIndexOf('.'))
  const size = defaultLibrary.items[type]?.size ?? { w: 1, h: 1 }
  const items: Item[] = []
  const stages = new Map<string, Stage>()
  const labels: { x: number; y: number; text: string }[] = []
  const gap = 1
  const top = 1
  const place = (id: string, x: number, y: number, s: { w: number; h: number }, rotation: Rotation, stage: Stage, text: string) => {
    items.push({ id, roomId: 'room', type, skin: key, cell: { x, y }, size: { w: s.w, h: s.h }, rotation })
    stages.set(id, stage)
    const turned = rotation % 180 !== 0
    labels.push({ x: (x + (turned ? s.h : s.w) / 2) * CELL, y: (y + (turned ? s.w : s.h)) * CELL + 14, text })
  }

  let x = 1
  for (const stage of STAGES) {
    place(`${key}-stage-${stage}`, x, top, size, 0, stage, stage)
    x += size.w + gap
  }
  let width = x
  const sizesTop = top + Math.max(size.w, size.h) + 1
  x = 1
  let rowHeight = 0
  for (const s of SIZES) {
    const turned = s.rotation % 180 !== 0
    place(`${key}-size-${s.w}x${s.h}-${s.rotation}`, x, sizesTop, s, s.rotation, 'overdue', `${s.w}×${s.h}${turned ? ' ↻' : ''}`)
    x += (turned ? s.h : s.w) + gap
    rowHeight = Math.max(rowHeight, turned ? s.w : s.h)
  }
  width = Math.max(width, x)
  const height = sizesTop + rowHeight + 1

  const room: Room = { id: 'room', homeId: 'home', name: '', cells: [{ x: 0, y: 0, w: width, h: height }] }
  const map = new MapView(skins)
  map.setHouse({ home: { id: 'home', name: key, gridSize: { w: width, h: height } }, rooms: [room], items })
  for (const l of labels) {
    const t = svg('text', { class: 'gallery-label', x: l.x, y: l.y, 'text-anchor': 'middle' })
    t.textContent = l.text
    map.layers.ui.append(t)
  }
  map.root.setAttribute('viewBox', `0 0 ${width * CELL} ${height * CELL}`)
  map.root.classList.add('gallery-map')
  map.root.style.setProperty('--w', String(width * CELL))

  const itemStatus = new Map<string, DecayStatus | null>()
  for (const [id, stage] of stages) {
    const pressure = PRESSURE[stage]
    itemStatus.set(id, { taskId: id, lastReset: new Date(0), elapsedDays: 0, pressure, stage: stageFor(pressure) })
  }
  return { map, status: { tasks: new Map(), items: itemStatus, rooms: new Map() } }
}
