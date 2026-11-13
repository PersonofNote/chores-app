/**
 * Pan and zoom for the map: one-finger or mouse drag pans, two-finger pinch zooms,
 * the wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms at the cursor.
 *
 * A drag only starts after the pointer moves DRAG_THRESHOLD px, so taps on items
 * still reach them (M6 builds tap and long-press on top of this).
 */
import type { Point, Rect } from '../render/geometry'
import { fitTo, panBy, toSvgTransform, zoomAt, type ScaleLimits, type ViewState } from './viewport-math'

export const DRAG_THRESHOLD = 6

export interface ViewportOptions {
  limits?: ScaleLimits
  /** Space around the house when fitting, in CSS px. */
  padding?: number
  onChange?: (state: ViewState) => void
  /**
   * Return true to leave a pointer alone (e.g. the editor is dragging something
   * with it). Checked on pointerdown.
   */
  claimsPointer?: (e: PointerEvent) => boolean
}

export class ViewportController {
  private state: ViewState = { scale: 1, tx: 0, ty: 0 }
  private readonly pointers = new Map<number, Point>()
  private dragging = false
  private downAt: Point | null = null
  /** Once the user pans or zooms, resizes stop refitting. */
  private userMoved = false
  private readonly limits: ScaleLimits
  private readonly padding: number
  private readonly onChange: ((s: ViewState) => void) | undefined
  private readonly claimsPointer: (e: PointerEvent) => boolean
  private readonly resizeObserver: ResizeObserver
  private readonly abort = new AbortController()

  constructor(
    private readonly surface: SVGSVGElement,
    private readonly target: SVGGElement,
    private readonly getBounds: () => Rect,
    opts: ViewportOptions = {},
  ) {
    this.limits = opts.limits ?? { min: 0.2, max: 6 }
    this.padding = opts.padding ?? 16
    this.onChange = opts.onChange
    this.claimsPointer = opts.claimsPointer ?? (() => false)

    const on = <K extends keyof SVGElementEventMap>(type: K, fn: (e: SVGElementEventMap[K]) => void, passive = true) =>
      surface.addEventListener(type, fn as EventListener, { signal: this.abort.signal, passive })
    on('pointerdown', (e) => this.onPointerDown(e))
    on('pointermove', (e) => this.onPointerMove(e))
    on('pointerup', (e) => this.onPointerUp(e))
    on('pointercancel', (e) => this.onPointerUp(e))
    on('wheel', (e) => this.onWheel(e), false)

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.userMoved) this.fit()
    })
    this.resizeObserver.observe(surface)
  }

  get view(): ViewState {
    return this.state
  }

  /** Fits the whole house in view. */
  fit(): void {
    const { width, height } = this.surface.getBoundingClientRect()
    if (width === 0 || height === 0) return
    this.set(fitTo(this.getBounds(), { w: width, h: height }, this.padding, this.limits))
  }

  destroy(): void {
    this.abort.abort()
    this.resizeObserver.disconnect()
  }

  private set(next: ViewState): void {
    this.state = next
    this.target.setAttribute('transform', toSvgTransform(next))
    this.onChange?.(next)
  }

  private local(e: { clientX: number; clientY: number }): Point {
    const r = this.surface.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.claimsPointer(e)) return
    const p = this.local(e)
    this.pointers.set(e.pointerId, p)
    if (this.pointers.size === 1) this.downAt = p
    if (this.pointers.size === 2) this.startDrag()
  }

  private onPointerMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    const p = this.local(e)

    if (!this.dragging && this.downAt && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) >= DRAG_THRESHOLD) {
      this.startDrag()
    }
    if (!this.dragging) {
      this.pointers.set(e.pointerId, p)
      return
    }

    if (this.pointers.size === 1) {
      this.pointers.set(e.pointerId, p)
      this.set(panBy(this.state, p.x - prev.x, p.y - prev.y))
      return
    }

    // Pinch: zoom by the change in finger distance about the old midpoint,
    // then pan by how far the midpoint moved.
    const [a, b] = [...this.pointers.values()] as [Point, Point]
    const before = { mid: midpoint(a, b), dist: Math.hypot(a.x - b.x, a.y - b.y) }
    this.pointers.set(e.pointerId, p)
    const [a2, b2] = [...this.pointers.values()] as [Point, Point]
    const after = { mid: midpoint(a2, b2), dist: Math.hypot(a2.x - b2.x, a2.y - b2.y) }
    if (before.dist === 0) return
    const zoomed = zoomAt(this.state, after.dist / before.dist, before.mid, this.limits)
    this.set(panBy(zoomed, after.mid.x - before.mid.x, after.mid.y - before.mid.y))
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId)
    if (this.surface.hasPointerCapture?.(e.pointerId)) this.surface.releasePointerCapture(e.pointerId)
    if (this.pointers.size === 0) {
      this.dragging = false
      this.downAt = null
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels as large ones.
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
    this.userMoved = true
    this.set(zoomAt(this.state, factor, this.local(e), this.limits))
  }

  private startDrag(): void {
    this.dragging = true
    this.userMoved = true
    // Capture only once dragging, so a plain tap still targets the item under it.
    for (const id of this.pointers.keys()) this.surface.setPointerCapture?.(id)
  }
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
