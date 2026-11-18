import './styles.css'
import { startApp } from './app'
import { registerServiceWorker } from './pwa/register'
import { offerUpdate } from './pwa/updates'

// Register first, so the app is cached for offline use even before first run finishes.
if (import.meta.env.PROD) {
  registerServiceWorker({ onUpdate: offerUpdate }).catch((err) => console.warn('Service worker registration failed', err))
}

const root = document.querySelector<HTMLElement>('#app')!
// Dev only: `?art` shows the art gallery instead of the app.
const start = import.meta.env.DEV && new URLSearchParams(location.search).has('art')
  ? import('./dev/art-gallery').then((m) => m.showArtGallery(root))
  : startApp(root)
start.catch((err: unknown) => {
  console.error(err)
  const msg = document.createElement('p')
  msg.className = 'empty-state'
  msg.textContent = `Couldn't start: ${err instanceof Error ? err.message : String(err)}`
  root.replaceChildren(msg)
})
