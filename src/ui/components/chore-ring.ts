/**
 * Chores fanned out around an item on the map. Stays open after a pick so more
 * chores can be logged; the controller closes it on a tap elsewhere.
 */
import type { Id } from '../../domain'
import type { Point } from '../../render/geometry'
import type { ChoreOption } from '../chores'
import { ringLayout } from '../ring-layout'
import { pressable } from './pressable'

export interface RingAnchor {
  /** Item center in overlay coordinates; re-read on every reposition. */
  center: () => Point
  /** Distance from the center to the buttons; re-read on every reposition. */
  radius: () => number
}

export interface RingHandlers {
  onPick: (taskId: Id) => void
  onMenu: (taskId: Id) => void
}

const EDGE_MARGIN = 56
/** How long a just-logged chore shows its check mark. */
const JUST_DONE_MS = 1200

export class ChoreRing {
  private readonly el: HTMLDivElement
  private anchor: RingAnchor | null = null
  private buttons = new Map<Id, HTMLButtonElement>()
  private owner: string | null = null

  constructor(private readonly container: HTMLElement, private readonly handlers: RingHandlers) {
    this.el = document.createElement('div')
    this.el.className = 'chore-ring'
    this.el.setAttribute('role', 'menu')
    this.el.hidden = true
    container.append(this.el)
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  /** Who opened the ring (an item or room id), so a second tap on it can toggle. */
  get openFor(): string | null {
    return this.isOpen ? this.owner : null
  }

  open(owner: string, label: string, anchor: RingAnchor, options: readonly ChoreOption[]): void {
    this.owner = owner
    this.anchor = anchor
    this.el.setAttribute('aria-label', `${label} chores`)
    this.buttons = new Map(options.map((o) => [o.task.id, this.button(o)]))
    this.el.replaceChildren(...this.buttons.values())
    this.el.hidden = false
    this.refresh(options)
    this.reposition()
  }

  /** Updates colors and stages in place, keeping the order the ring opened with. */
  refresh(options: readonly ChoreOption[]): void {
    for (const o of options) {
      const b = this.buttons.get(o.task.id)
      if (!b) continue
      b.dataset.stage = o.stage
      b.style.setProperty('--chore-color', o.color)
    }
  }

  markDone(taskId: Id): void {
    const b = this.buttons.get(taskId)
    if (!b) return
    b.dataset.justDone = 'true'
    setTimeout(() => delete b.dataset.justDone, JUST_DONE_MS)
  }

  reposition(): void {
    if (!this.anchor || !this.isOpen) return
    const { width, height } = this.container.getBoundingClientRect()
    const { positions } = ringLayout(this.buttons.size, this.anchor.center(), this.anchor.radius(), { w: width, h: height }, EDGE_MARGIN)
    ;[...this.buttons.values()].forEach((b, i) => {
      const p = positions[i]!
      b.style.left = `${p.x}px`
      b.style.top = `${p.y}px`
    })
  }

  close(): void {
    this.el.hidden = true
    this.el.replaceChildren()
    this.buttons.clear()
    this.anchor = null
    this.owner = null
  }

  private button(o: ChoreOption): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chore-ring-button'
    b.setAttribute('role', 'menuitem')
    const dot = document.createElement('span')
    dot.className = 'chore-dot'
    dot.setAttribute('aria-hidden', 'true')
    const name = document.createElement('span')
    name.textContent = o.task.name
    b.append(dot, name)
    pressable(b, {
      onTap: () => this.handlers.onPick(o.task.id),
      onLongPress: () => this.handlers.onMenu(o.task.id),
    })
    return b
  }
}
