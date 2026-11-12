// Dev tool: screenshot a page in headless Chrome and print its console output and
// exceptions, via the DevTools Protocol (no dependencies; needs Google Chrome).
// Usage: node scripts/screenshot.mjs <url> <out.png> [light|dark] [wait-ms]
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const [url, out, scheme = 'light', wait = '3000'] = process.argv.slice(2)
const port = 9333 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'cdp-'))
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=900,700', 'about:blank'],
  { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let targets
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await sleep(100) } }
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0; const pending = new Map()
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? msg.error); pending.delete(msg.id) }
  if (msg.method === 'Runtime.consoleAPICalled') console.log(`[console.${msg.params.type}]`, msg.params.args.map((a) => a.value ?? a.description).join(' '))
  if (msg.method === 'Runtime.exceptionThrown') console.log('[exception]', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
})
await send('Runtime.enable'); await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
await send('Page.navigate', { url })
await sleep(Number(wait))
const { data } = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(data, 'base64'))
console.log('saved', out)
ws.close(); chrome.kill()
