/**
 * Art skins: hand-drawn looks, bundled at build time and cached offline by the
 * service worker like the rest of the build.
 *
 * Drop a file at `src/render/art/<type>/<look>.svg` and it registers as skin
 * `<type>.<look>`. No list to edit. Start from a template in `art/templates/`.
 *
 * - Settings (fit, caps, label) go on the root `<svg>`; see `parse.ts`.
 * - Stage variants: `<look>@overdue.svg` (or `@due-soon`, `@neglected`...) makes the look
 *   stage-aware; the map shows the latest variant the item's stage has reached, else
 *   the base file. Use it for key items that should change themselves (a wilting plant).
 * - Raster art (`<look>.png` or `.webp`) works the same way. Its size and fit come from an
 *   optional `<look>.json` beside it: `{ "width": 96, "height": 48, "fit": "segments",
 *   "caps": [12, 12], "label": "..." }`.
 */
import { STAGES, type Stage } from '../../domain'
import { CELL } from '../geometry'
import type { SkinContext, SkinRegistry, SkinRenderer } from '../skins'
import { SVG_NS, svg } from '../svg'
import { layoutArt, type ArtFit, type Box } from './fit'
import { parseArt, type ArtNode } from './parse'

export interface ArtVariant {
  /** Shown from this stage on; null for the base drawing. */
  stage: Stage | null
  viewBox: Box
  fit: ArtFit
  /** Fresh nodes for one slice. */
  content: () => SVGElement[]
}

export interface ArtLook {
  /** Skin key, `<type>.<look>`. */
  key: string
  label?: string
  variants: ArtVariant[]
}

export interface RasterMeta {
  width?: number
  height?: number
  fit?: 'contain' | 'segments'
  caps?: [number, number]
  label?: string
}

const NAME = /^(?:.*\/)?([^/]+)\/([^/@]+)(?:@([^/.]+))?\.(svg|png|webp)$/

/**
 * Groups art files into looks. Keys are paths like `./bed/quilt.svg`; SVG values are
 * file text, raster values are URLs. Files with an unknown stage suffix are ignored.
 */
export function buildArtLooks(
  svgs: Record<string, string>,
  rasters: Record<string, string> = {},
  sidecars: Record<string, RasterMeta> = {},
): ArtLook[] {
  const looks = new Map<string, ArtLook>()
  const add = (path: string, make: (key: string, idPrefix: string) => { variant: Omit<ArtVariant, 'stage'>; label?: string }) => {
    const m = NAME.exec(path)
    if (!m) return
    const [, type, look, suffix] = m
    const stage = suffix === undefined ? null : (STAGES as readonly string[]).includes(suffix) ? (suffix as Stage) : undefined
    if (stage === undefined) return
    const key = `${type}.${look}`
    const entry = looks.get(key) ?? { key, variants: [] }
    const { variant, label } = make(key, `art-${type}-${look}${suffix ? `-${suffix}` : ''}`)
    entry.variants.push({ ...variant, stage })
    if (label && stage === null) entry.label = label
    looks.set(key, entry)
  }

  for (const [path, text] of Object.entries(svgs)) {
    add(path, (_, prefix) => {
      const art = parseArt(text, prefix)
      return { variant: { viewBox: art.viewBox, fit: art.fit, content: () => art.nodes.map(buildNode) }, ...(art.label ? { label: art.label } : {}) }
    })
  }
  for (const [path, url] of Object.entries(rasters)) {
    const meta = sidecars[path.replace(/\.(png|webp)$/, '.json')] ?? {}
    add(path, () => {
      const viewBox = { x: 0, y: 0, w: meta.width ?? CELL, h: meta.height ?? CELL }
      const fit: ArtFit = meta.fit === 'segments' ? { kind: 'segments', caps: meta.caps ?? [viewBox.w / 4, viewBox.w / 4] } : { kind: 'contain' }
      const content = () => [svg('image', { href: url, width: viewBox.w, height: viewBox.h, preserveAspectRatio: 'none' })]
      return { variant: { viewBox, fit, content }, ...(meta.label ? { label: meta.label } : {}) }
    })
  }
  return [...looks.values()]
    .filter((l) => l.variants.some((v) => v.stage === null))
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** The variant to show at a stage: the latest one reached, else the base drawing. */
export function pickVariant(variants: readonly ArtVariant[], stage: Stage | 'unknown'): ArtVariant {
  const at = (STAGES as readonly string[]).indexOf(stage)
  let best: ArtVariant | undefined
  let bestAt = -1
  for (const v of variants) {
    const i = v.stage === null ? -1 : STAGES.indexOf(v.stage)
    if (i <= at && (best === undefined || i > bestAt)) {
      best = v
      bestAt = i
    }
  }
  return best ?? variants.find((v) => v.stage === null) ?? variants[0]!
}

export function artSkin(look: ArtLook): SkinRenderer {
  return ({ width, height, stage }: SkinContext) => {
    const variant = pickVariant(look.variants, stage)
    const slices = layoutArt(variant.viewBox, variant.fit, width, height)
    return svg(
      'g',
      { class: 'skin-art' },
      slices.map((s) =>
        svg(
          'svg',
          {
            x: s.x,
            y: s.y,
            width: s.width,
            height: s.height,
            viewBox: `${s.viewBox.x} ${s.viewBox.y} ${s.viewBox.w} ${s.viewBox.h}`,
            preserveAspectRatio: 'none',
            overflow: 'hidden',
          },
          variant.content(),
        ),
      ),
    )
  }
}

function buildNode(node: ArtNode): SVGElement {
  const el = document.createElementNS(SVG_NS, node.tag)
  for (const [k, v] of Object.entries(node.attrs)) el.setAttribute(k, v)
  for (const child of node.children) el.appendChild(buildNode(child))
  return el
}

export function registerArtSkins(registry: SkinRegistry, looks: readonly ArtLook[]): SkinRegistry {
  for (const look of looks) {
    registry.register(look.key, artSkin(look), {
      outline: true,
      stageAware: look.variants.length > 1,
      ...(look.label ? { label: look.label } : {}),
    })
  }
  return registry
}

/** The art bundled with the app. */
export function bundledArtLooks(): ArtLook[] {
  const svgs = import.meta.glob<string>('./*/*.svg', { query: '?raw', import: 'default', eager: true })
  const rasters = import.meta.glob<string>('./*/*.{png,webp}', { query: '?url', import: 'default', eager: true })
  const sidecars = import.meta.glob<RasterMeta>('./*/*.json', { import: 'default', eager: true })
  return buildArtLooks(svgs, rasters, sidecars)
}
