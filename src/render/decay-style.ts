/**
 * How decay looks in the MVP, pure. Color follows pressure continuously:
 *
 *   neutral ── (dueSoon) ──▶ amber ── (overdue) ──▶ red ── (neglected, capped)
 *
 * interpolated in OKLCH so the steps look even. From Overdue on the stroke also gets
 * heavier, a cue that doesn't depend on color vision.
 *
 * Ramp positions come from DecayConfig, so tuning thresholds retunes the colors too.
 */
import { DEFAULT_DECAY_CONFIG, type DecayConfig, type DecayStatus, type Stage } from '../domain'

export interface Oklch {
  l: number
  c: number
  h: number
}

export interface DecayPalette {
  neutral: Oklch
  amber: Oklch
  red: Oklch
}

export const LIGHT_PALETTE: DecayPalette = {
  neutral: { l: 0.42, c: 0.02, h: 255 },
  amber: { l: 0.72, c: 0.16, h: 70 },
  red: { l: 0.55, c: 0.21, h: 27 },
}

export const DARK_PALETTE: DecayPalette = {
  neutral: { l: 0.84, c: 0.02, h: 255 },
  amber: { l: 0.8, c: 0.15, h: 75 },
  red: { l: 0.68, c: 0.19, h: 25 },
}

/** Item stroke widths in user units. */
export const STROKE = { normal: 2, heavy: 3.5 } as const

/** Below this chroma a color's hue is meaningless, so interpolation borrows the other end's. */
const ACHROMATIC = 0.04

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export function mixOklch(a: Oklch, b: Oklch, t: number): Oklch {
  const ha = a.c < ACHROMATIC ? b.h : a.h
  const hb = b.c < ACHROMATIC ? a.h : b.h
  const dh = ((((hb - ha) % 360) + 540) % 360) - 180 // shortest arc
  return {
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: (((ha + dh * t) % 360) + 360) % 360,
  }
}

export function oklchCss({ l, c, h }: Oklch, alpha = 1): string {
  const r = (n: number, d: number) => Number(n.toFixed(d))
  return alpha < 1 ? `oklch(${r(l, 3)} ${r(c, 3)} ${r(h, 1)} / ${r(alpha, 3)})` : `oklch(${r(l, 3)} ${r(c, 3)} ${r(h, 1)})`
}

/** 0 up to Due soon, 1 at Neglected and beyond. */
export function decayAmount(pressure: number, config: DecayConfig = DEFAULT_DECAY_CONFIG): number {
  const { dueSoon, neglected } = config.thresholds
  return clamp01((pressure - dueSoon) / (neglected - dueSoon))
}

export function decayColor(
  pressure: number,
  palette: DecayPalette,
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
): Oklch {
  const { dueSoon, overdue, neglected } = config.thresholds
  if (pressure <= dueSoon) return palette.neutral
  if (pressure < overdue) return mixOklch(palette.neutral, palette.amber, (pressure - dueSoon) / (overdue - dueSoon))
  return mixOklch(palette.amber, palette.red, clamp01((pressure - overdue) / (neglected - overdue)))
}

export interface ItemDecayStyle {
  /** CSS color for the item's strokes. */
  color: string
  strokeWidth: number
  /** 'unknown' when no task under the item has ever been logged. */
  stage: Stage | 'unknown'
}

export function itemDecayStyle(
  status: DecayStatus | null,
  palette: DecayPalette,
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
): ItemDecayStyle {
  if (!status) return { color: oklchCss(palette.neutral), strokeWidth: STROKE.normal, stage: 'unknown' }
  const heavy = status.stage === 'overdue' || status.stage === 'neglected'
  return {
    color: oklchCss(decayColor(status.pressure, palette, config)),
    strokeWidth: heavy ? STROKE.heavy : STROKE.normal,
    stage: status.stage,
  }
}

/** Max opacity of the floor tint, kept low so it never overpowers item colors. */
const FLOOR_TINT_MAX_ALPHA = 0.22
const FLOOR_TINT_MIN_ALPHA = 0.06
/** Floor tints are desaturated relative to item strokes. */
const FLOOR_TINT_CHROMA_SCALE = 0.6

/** Tint over a room from its floor item's decay, or null while the floor is fine. */
export function floorTint(
  status: DecayStatus | null,
  palette: DecayPalette,
  config: DecayConfig = DEFAULT_DECAY_CONFIG,
): string | null {
  if (!status) return null
  const amount = decayAmount(status.pressure, config)
  if (amount <= 0) return null
  const color = decayColor(status.pressure, palette, config)
  const alpha = FLOOR_TINT_MIN_ALPHA + (FLOOR_TINT_MAX_ALPHA - FLOOR_TINT_MIN_ALPHA) * amount
  return oklchCss({ ...color, c: color.c * FLOOR_TINT_CHROMA_SCALE }, alpha)
}
