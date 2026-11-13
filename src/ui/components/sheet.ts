/**
 * Bottom sheet on the native <dialog>: focus handling, Esc and the backdrop come
 * from the platform. One sheet at a time; opening another replaces it.
 */
export interface SheetContent {
  title: string
  subtitle?: string
  body: HTMLElement
  onClose?: () => void
}

export class SheetHost {
  private current: { dialog: HTMLDialogElement; onClose: (() => void) | undefined } | null = null

  constructor(private readonly container: HTMLElement) {}

  get isOpen(): boolean {
    return this.current !== null
  }

  open(content: SheetContent): void {
    this.close()
    const dialog = document.createElement('dialog')
    dialog.className = 'sheet'
    const header = document.createElement('header')
    const titles = document.createElement('div')
    const h = document.createElement('h2')
    h.textContent = content.title
    titles.append(h)
    if (content.subtitle) {
      const sub = document.createElement('p')
      sub.className = 'sheet-subtitle'
      sub.textContent = content.subtitle
      titles.append(sub)
    }
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'sheet-close'
    close.setAttribute('aria-label', 'Close')
    close.textContent = '×'
    close.addEventListener('click', () => this.close())
    header.append(titles, close)
    dialog.append(header, content.body)
    dialog.setAttribute('aria-label', content.title)

    // Esc: let us close (and run onClose) instead of the browser.
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault()
      this.close()
    })
    // A click on the dialog box itself, outside its content, is the backdrop.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) this.close()
    })

    this.container.append(dialog)
    this.current = { dialog, onClose: content.onClose }
    // Focus the sheet itself rather than its first button (the close ×), so nothing
    // is pre-highlighted; Tab still moves into the content.
    dialog.tabIndex = -1
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.focus({ preventScroll: true })
  }

  close(): void {
    const current = this.current
    if (!current) return
    this.current = null
    if (current.dialog.open && typeof current.dialog.close === 'function') current.dialog.close()
    current.dialog.remove()
    current.onClose?.()
  }
}

/** Small DOM helper for panel bodies. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; attrs?: Record<string, string> } = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props.className) node.className = props.className
  if (props.text !== undefined) node.textContent = props.text
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v)
  node.append(...children)
  return node
}

export function button(label: string, onClick: () => void, className = 'sheet-button'): HTMLButtonElement {
  const b = el('button', { className, text: label, attrs: { type: 'button' } })
  b.addEventListener('click', onClick)
  return b
}
