/**
 * How a drawing fills a resized footprint. Pure layout math.
 *
 * - `contain`: keep the aspect ratio, as large as fits, centered (beds, plants, toilets).
 * - `segments`: scale to the box's height, keep the end caps as drawn and repeat the
 *   middle to fill the width (counters, shelves, sofas). A box too narrow for both caps
 *   falls back to `contain`.
 *
 * The result is a list of slices: each shows one region of the drawing (`viewBox`) in
 * one rectangle of the item, stretched exactly (the renderer uses nested `<svg>`s with
 * `preserveAspectRatio="none"`, which also clips each slice).
 */
import { ART_INSET } from '../skins'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type ArtFit = { kind: 'contain' } | { kind: 'segments'; caps: readonly [number, number] }

export interface Slice {
  x: number
  y: number
  width: number
  height: number
  viewBox: Box
}

export function containSlices(art: Box, box: Box): Slice[] {
  const s = Math.min(box.w / art.w, box.h / art.h)
  const width = art.w * s
  const height = art.h * s
  return [{ x: box.x + (box.w - width) / 2, y: box.y + (box.h - height) / 2, width, height, viewBox: art }]
}

export function segmentSlices(art: Box, [left, right]: readonly [number, number], box: Box): Slice[] {
  const s = box.h / art.h
  const mid = art.w - left - right
  const capL = left * s
  const capR = right * s
  const span = box.w - capL - capR
  if (mid <= 0 || span <= 0) return containSlices(art, box)
  const n = Math.max(1, Math.round(span / (mid * s)))
  const tile = span / n
  const slice = (x: number, width: number, vx: number, vw: number): Slice => ({
    x,
    y: box.y,
    width,
    height: box.h,
    viewBox: { x: vx, y: art.y, w: vw, h: art.h },
  })
  const slices: Slice[] = []
  if (left > 0) slices.push(slice(box.x, capL, art.x, left))
  for (let i = 0; i < n; i++) slices.push(slice(box.x + capL + i * tile, tile, art.x + left, mid))
  if (right > 0) slices.push(slice(box.x + box.w - capR, capR, art.x + art.w - right, right))
  return slices
}

/** The art box for a width × height item centered on the origin: the footprint minus `ART_INSET`. */
export function artBox(width: number, height: number): Box {
  return {
    x: -width / 2 + ART_INSET,
    y: -height / 2 + ART_INSET,
    w: Math.max(1, width - 2 * ART_INSET),
    h: Math.max(1, height - 2 * ART_INSET),
  }
}

export function layoutArt(art: Box, fit: ArtFit, width: number, height: number): Slice[] {
  const box = artBox(width, height)
  return fit.kind === 'segments' ? segmentSlices(art, fit.caps, box) : containSlices(art, box)
}
