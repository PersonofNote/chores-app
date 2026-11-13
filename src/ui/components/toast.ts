/**
 * A single toast at the bottom of the screen, optionally with an action (Undo).
 * Showing a new toast replaces the current one, which ends its undo window.
 */
export const TOAST_MS = 5000

export interface ToastAction {
  label: string
  run: () => void
}

export class Toaster {
  private readonly el: HTMLDivElement
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(container: HTMLElement, private readonly durationMs = TOAST_MS) {
    this.el = document.createElement('div')
    this.el.className = 'toast'
    this.el.setAttribute('role', 'status')
    this.el.setAttribute('aria-live', 'polite')
    this.el.hidden = true
    container.append(this.el)
  }

  /** `persist` keeps it up until acted on or replaced (e.g. "Update available"). */
  show(message: string, action?: ToastAction, opts: { persist?: boolean } = {}): void {
    this.clearTimer()
    const text = document.createElement('span')
    text.textContent = message
    this.el.replaceChildren(text)
    if (action) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = action.label
      button.addEventListener('click', () => {
        this.dismiss()
        action.run()
      })
      this.el.append(button)
    }
    this.el.hidden = false
    if (!opts.persist) this.timer = setTimeout(() => this.dismiss(), this.durationMs)
  }

  dismiss(): void {
    this.clearTimer()
    this.el.hidden = true
    this.el.replaceChildren()
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
