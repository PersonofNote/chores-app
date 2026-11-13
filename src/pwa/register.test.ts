// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './register'

/** Just enough of the Service Worker API to drive the update flow. */
function fakes(opts: { controller: boolean; waiting?: boolean }) {
  const worker = (state: string) =>
    Object.assign(new EventTarget(), { state, postMessage: vi.fn() }) as unknown as ServiceWorker & { state: string }
  const waiting = opts.waiting ? worker('installed') : null
  const registration = Object.assign(new EventTarget(), {
    waiting,
    installing: null as (ServiceWorker & { state: string }) | null,
    update: vi.fn(async () => {}),
  })
  const container = Object.assign(new EventTarget(), {
    controller: opts.controller ? ({} as ServiceWorker) : null,
    register: vi.fn(async () => registration),
  }) as unknown as ServiceWorkerContainer
  return { container, registration, waiting, worker }
}

describe('registerServiceWorker', () => {
  it('registers relative to the page', async () => {
    const f = fakes({ controller: false })
    await registerServiceWorker({ container: f.container, onUpdate: vi.fn() })
    expect(f.container.register).toHaveBeenCalledWith('./sw.js')
  })

  it('a first install is not an update, and its takeover does not reload', async () => {
    const f = fakes({ controller: false })
    const onUpdate = vi.fn()
    const reload = vi.fn()
    await registerServiceWorker({ container: f.container, onUpdate, reload })
    const w = f.worker('installing')
    f.registration.installing = w
    f.registration.dispatchEvent(new Event('updatefound'))
    w.state = 'installed'
    w.dispatchEvent(new Event('statechange'))
    f.container.dispatchEvent(new Event('controllerchange'))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('offers a waiting update; activating it skips waiting, then reloads on takeover', async () => {
    const f = fakes({ controller: true, waiting: true })
    const reload = vi.fn()
    let activate: (() => void) | undefined
    await registerServiceWorker({ container: f.container, onUpdate: (a) => (activate = a), reload })
    expect(activate).toBeDefined()
    expect(reload).not.toHaveBeenCalled()
    activate!()
    expect(f.waiting!.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    f.container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('offers an update found while running', async () => {
    const f = fakes({ controller: true })
    const onUpdate = vi.fn()
    await registerServiceWorker({ container: f.container, onUpdate })
    const w = f.worker('installing')
    f.registration.installing = w
    f.registration.dispatchEvent(new Event('updatefound'))
    w.state = 'installed'
    w.dispatchEvent(new Event('statechange'))
    expect(onUpdate).toHaveBeenCalledOnce()
  })

  it('does nothing where service workers are unsupported', async () => {
    expect(await registerServiceWorker({ container: undefined, onUpdate: vi.fn() })).toBeNull()
  })
})
