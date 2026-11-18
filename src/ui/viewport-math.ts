/**
 * Pan/zoom state, pure. A content point p appears on screen at p * scale + (tx, ty),
 * in CSS pixels relative to the map element.
 */
import type { Point, Rect } from '../render/geometry'

export interface ViewState {
  scale: number
  tx: number
  ty: number
}

export interface ScaleLimits {
  min: number
  max: number
}

export interface Size {
  w: number
  h: number
}

const clamp = (v: number, { min, max }: ScaleLimits) => Math.min(max, Math.max(min, v))

/** Centers `bounds` in `viewport`, as large as fits inside `padding`. */
export function fitTo(bounds: Rect, viewport: Size, padding: number, limits: ScaleLimits): ViewState {
  const availW = Math.max(1, viewport.w - 2 * padding)
  const availH = Math.max(1, viewport.h - 2 * padding)
  const scale = clamp(Math.min(availW / bounds.w, availH / bounds.h), limits)
  return {
    scale,
    tx: (viewport.w - bounds.w * scale) / 2 - bounds.x * scale,
    ty: (viewport.h - bounds.h * scale) / 2 - bounds.y * scale,
  }
}

export function screenToContent(s: ViewState, p: Point): Point {
  return { x: (p.x - s.tx) / s.scale, y: (p.y - s.ty) / s.scale }
}

/** Zooms by `factor`, keeping the content under screen point `at` fixed. */
export function zoomAt(s: ViewState, factor: number, at: Point, limits: ScaleLimits): ViewState {
  const scale = clamp(s.scale * factor, limits)
  const anchor = screenToContent(s, at)
  return { scale, tx: at.x - anchor.x * scale, ty: at.y - anchor.y * scale }
}

/**
 * Pans just enough that at least `margin` px of `bounds` stays on screen on each axis
 * (all of it, if it's smaller), so the house can go nearly off screen but never fully.
 * Scale is unchanged.
 */
export function keepInView(s: ViewState, bounds: Rect, viewport: Size, margin: number): ViewState {
  const axis = (t: number, start: number, length: number, screen: number) => {
    const size = length * s.scale
    const m = Math.min(margin, size, screen)
    const lo = m - size // the far edge sits m px inside the near side of the screen
    const hi = screen - m // the near edge sits m px inside the far side
    const edge = start * s.scale + t
    return t + Math.min(hi, Math.max(lo, edge)) - edge
  }
  return {
    scale: s.scale,
    tx: axis(s.tx, bounds.x, bounds.w, viewport.w),
    ty: axis(s.ty, bounds.y, bounds.h, viewport.h),
  }
}

export function panBy(s: ViewState, dx: number, dy: number): ViewState {
  return { ...s, tx: s.tx + dx, ty: s.ty + dy }
}

export const toSvgTransform = (s: ViewState) => `translate(${s.tx} ${s.ty}) scale(${s.scale})`
