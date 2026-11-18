/**
 * Icon skins: vendored Lucide icons (ISC, see ./lucide/LICENSE), drawn as line art
 * on the map. Files are bundled at build time; there's no runtime package.
 *
 * To add an icon: copy the SVG into ./lucide/, then map the item type below.
 */
import { CELL } from '../geometry'
import { svg } from '../svg'
import { footprintRect, type SkinRegistry, type SkinRenderer } from '../skins'
import { parseIcon, type IconShape } from './parse'

const files = import.meta.glob<string>('./lucide/*.svg', { query: '?raw', import: 'default', eager: true })

/** Icon name (file name without extension) → its shapes. */
export const ICONS: ReadonlyMap<string, IconShape[]> = new Map(
  Object.entries(files).map(([path, text]) => [path.replace(/^.*\/|\.svg$/g, ''), parseIcon(text)]),
)

/** Item type → icon name. */
export const ICON_FOR_TYPE: Readonly<Record<string, string>> = {
  bed: 'bed-double',
  sofa: 'sofa',
  toilet: 'toilet',
  shower: 'shower-head',
  sink: 'faucet',
  stove: 'cooking-pot',
  fridge: 'refrigerator',
  'washing-machine': 'washing-machine',
  plant: 'plant-pot',
  'hvac-filter': 'air-vent',
  'smoke-detector': 'alarm-smoke',
  'water-heater': 'heater',
  closet: 'shirt',
  counter: 'spray-can',
  dresser: 'archive',
  table: 'utensils',
  desk: 'lamp-desk',
  chair: 'armchair',
  shelf: 'library-big',
  cabinet: 'columns-2',
}

/** Icon source grid: Lucide draws on 24 × 24. */
const ICON_GRID = 24
/** Share of the footprint's shorter side the icon fills. */
const ICON_FILL = 0.72
/** Largest icon, in cells: a resized 4 × 4 bed gets a big outline, not a giant icon. */
export const MAX_ICON_CELLS = 2

/**
 * Draws the icon centered in the item's footprint, plus a faint footprint outline
 * so multi-cell items (a 2 × 2 bed) read at their real size.
 *
 * The icon is scaled into place, so its stroke width is divided by the same factor:
 * the line weight on the map then equals `--item-stroke`, matching other skins.
 */
export function iconSkin(shapes: readonly IconShape[]): SkinRenderer {
  return ({ width, height }) => {
    const size = Math.min(width, height, MAX_ICON_CELLS * CELL) * ICON_FILL
    const scale = size / ICON_GRID
    return svg('g', { class: 'skin-icon' }, [
      svg('rect', { class: 'footprint', ...footprintRect(width, height) }),
      svg(
        'g',
        {
          class: 'icon',
          transform: `translate(${-size / 2} ${-size / 2}) scale(${scale})`,
          style: `stroke-width: calc(var(--item-stroke) / ${scale})`,
        },
        shapes.map((s) => svg(s.tag, s.attrs)),
      ),
    ])
  }
}

/** Registers `<type>.icon` for every mapped type whose icon file exists. */
export function registerIconSkins(registry: SkinRegistry, mapping = ICON_FOR_TYPE): SkinRegistry {
  for (const [type, name] of Object.entries(mapping)) {
    const shapes = ICONS.get(name)
    if (shapes) registry.register(`${type}.icon`, iconSkin(shapes))
  }
  return registry
}
