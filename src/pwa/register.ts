/**
 * Registers the service worker (production builds only) and surfaces updates.
 *
 * A new version installs in the background and waits. `onUpdate` is called with a
 * function that activates it; the page reloads once the new worker takes over.
 * Nothing reloads unless asked, so an update never interrupts someone mid-use.
 */
export interface ServiceWorkerOptions {
  onUpdate: (activate: () => void) => void
  container?: ServiceWorkerContainer | undefined
  reload?: () => void
}

export async function registerServiceWorker(opts: ServiceWorkerOptions): Promise<ServiceWorkerRegistration | null> {
  const sw = opts.container ?? (typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined)
  if (!sw) return null
  const reload = opts.reload ?? (() => location.reload())

  let updateRequested = false
  sw.addEventListener('controllerchange', () => {
    // First installs also change controller (clients.claim); only reload for an update we asked for.
    if (updateRequested) reload()
  })

  const offer = (worker: ServiceWorker) =>
    opts.onUpdate(() => {
      updateRequested = true
      worker.postMessage({ type: 'SKIP_WAITING' })
    })

  const registration = await sw.register('./sw.js')
  // An update found on an earlier visit may already be waiting.
  if (registration.waiting && sw.controller) offer(registration.waiting)
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    worker?.addEventListener('statechange', () => {
      // `controller` is null on the very first install: that's not an update.
      if (worker.state === 'installed' && sw.controller) offer(worker)
    })
  })
  // Installed apps stay open for days; look for updates when brought back to front.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {})
  })
  return registration
}
