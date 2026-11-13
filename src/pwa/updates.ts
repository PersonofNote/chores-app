/**
 * Hands a waiting update from the service worker (registered at startup) to the
 * UI (ready later, e.g. after first run). Whichever side arrives second triggers it.
 */
type Activate = () => void

let pending: Activate | null = null
let listener: ((activate: Activate) => void) | null = null

export function offerUpdate(activate: Activate): void {
  pending = activate
  listener?.(activate)
}

export function onUpdateAvailable(fn: (activate: Activate) => void): void {
  listener = fn
  if (pending) fn(pending)
}
