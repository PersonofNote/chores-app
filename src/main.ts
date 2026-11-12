import './styles.css'
import { startApp } from './app'

const root = document.querySelector<HTMLElement>('#app')!
startApp(root).catch((err: unknown) => {
  console.error(err)
  const msg = document.createElement('p')
  msg.className = 'empty-state'
  msg.textContent = `Couldn't start: ${err instanceof Error ? err.message : String(err)}`
  root.replaceChildren(msg)
})
