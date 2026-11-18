/**
 * Drawing templates for art skins (`npm run art-templates` writes them to `art/templates/`).
 *
 * The page is the art's safe area at the default size: draw edge to edge on it and the
 * drawing lands just inside the map's footprint outline. One unit is one map unit, and a
 * cell is 48. The guides (cell edges, outline, segment lines, notes) sit on a locked
 * "guides" layer, which the art loader ignores.
 */
import { CELL } from '../geometry'
import { ART_INSET, FOOTPRINT_INSET, FOOTPRINT_RADIUS } from '../skins'

export interface TemplateSpec {
  /** File name without extension. */
  name: string
  cells: { w: number; h: number }
  fit: 'contain' | 'segments'
}

export const TEMPLATES: readonly TemplateSpec[] = [
  { name: '1x1', cells: { w: 1, h: 1 }, fit: 'contain' },
  { name: '2x1-segments', cells: { w: 2, h: 1 }, fit: 'segments' },
  { name: '2x2', cells: { w: 2, h: 2 }, fit: 'contain' },
]

export function artTemplate({ cells, fit }: TemplateSpec): string {
  const w = cells.w * CELL - 2 * ART_INSET
  const h = cells.h * CELL - 2 * ART_INSET
  /** Cell coordinates on the page: the page starts ART_INSET inside the first cell. */
  const o = -ART_INSET
  const caps = fit === 'segments' ? Math.round(h / 2) : 0
  const lines: string[] = []
  for (let x = 0; x <= cells.w; x++) lines.push(`<line x1="${o + x * CELL}" y1="${o}" x2="${o + x * CELL}" y2="${o + cells.h * CELL}"/>`)
  for (let y = 0; y <= cells.h; y++) lines.push(`<line x1="${o}" y1="${o + y * CELL}" x2="${o + cells.w * CELL}" y2="${o + y * CELL}"/>`)
  const outline = `<rect x="${o + FOOTPRINT_INSET}" y="${o + FOOTPRINT_INSET}" width="${cells.w * CELL - 2 * FOOTPRINT_INSET}" height="${cells.h * CELL - 2 * FOOTPRINT_INSET}" rx="${FOOTPRINT_RADIUS}"/>`
  const segmentGuides = caps
    ? `\n    <g stroke="#2a7de1" stroke-width="0.5" stroke-dasharray="2 1.5">
      <line x1="${caps}" y1="${o}" x2="${caps}" y2="${h - o}"/>
      <line x1="${w - caps}" y1="${o}" x2="${w - caps}" y2="${h - o}"/>
    </g>`
    : ''
  const notes = [
    `Template ${cells.w} × ${cells.h} cells (${fit}). Draw on the page, in the Art layer.`,
    'The page is the safe area: the map draws the decay outline (red) just outside it.',
    fit === 'segments'
      ? `Segments: the ends (left of and right of the blue lines, ${caps} units) stay as drawn; the middle repeats.`
      : 'Contain: a resized item scales this drawing up or down, keeping its shape.',
    'Use fills. Keep shapes bold: a cell is about 25 px on a phone.',
    'Save as src/render/art/<type>/<look>.svg (e.g. bed/quilt.svg), as plain SVG.',
    'Optional: <look>@overdue.svg (or @due-soon, @neglected) for a stage variant.',
    'Settings on the root <svg>: data-fit, data-caps, data-label. This guides layer is ignored.',
  ]
  const noteY = h - o + 8
  const text = notes.map((n, i) => `<text x="${o}" y="${noteY + i * 6}">${escape(n)}</text>`).join('\n      ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
  xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
  width="${w * 8}" height="${h * 8}" viewBox="0 0 ${w} ${h}"
  data-fit="${fit}"${caps ? ` data-caps="${caps} ${caps}"` : ''} data-label="">
  <g id="guides" inkscape:label="guides" inkscape:groupmode="layer" sodipodi:insensitive="true">
    <g fill="none" stroke="#9aa0ad" stroke-width="0.4">
      ${lines.join('\n      ')}
    </g>
    <g fill="none" stroke="#d0453a" stroke-width="0.6" stroke-dasharray="3 2">
      ${outline}
    </g>${segmentGuides}
    <g font-family="sans-serif" font-size="3.6" fill="#6b7080">
      ${text}
    </g>
  </g>
  <g id="art" inkscape:label="Art" inkscape:groupmode="layer">
  </g>
</svg>
`
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
