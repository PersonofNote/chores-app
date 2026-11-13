/**
 * Tap and long-press on an HTML button, matching the map's gestures.
 *
 * Tap is the button's `click`, so keyboard and assistive tech work for free.
 * Long-press is a held pointer, a right-click, or the context-menu key.
 */
import { LONG_PRESS_MS } from '../gestures'
import { DRAG_THRESHOLD } from '../viewport'

export interface PressHandlers {
  onTap: () => void
  onLongPress?: () => void
}

export function pressable(button: HTMLElement, { onTap, onLongPress }: PressHandlers): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let start: { x: number; y: number } | null = null
  let suppressClick = false
  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    start = null
  }

  button.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false
      return
    }
    onTap()
  })
  if (!onLongPress) return

  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    suppressClick = false
    start = { x: e.clientX, y: e.clientY }
    timer = setTimeout(() => {
      timer = null
      suppressClick = true
      // Some platforms never send the click after a hold; don't eat a later one.
      setTimeout(() => (suppressClick = false), 800)
      onLongPress()
    }, LONG_PRESS_MS)
  })
  button.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= DRAG_THRESHOLD) cancel()
  })
  button.addEventListener('pointerup', cancel)
  button.addEventListener('pointercancel', cancel)
  button.addEventListener('pointerleave', cancel)
  button.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (suppressClick) return // already handled by the hold timer
    cancel()
    onLongPress()
  })
}
