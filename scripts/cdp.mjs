// Minimal Chrome DevTools Protocol helper for dev scripts (no dependencies).
// Launches headless Google Chrome (override the binary with CHROME=...).
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Runs `fn(page)` against a fresh headless Chrome tab, then shuts Chrome down. */
export async function withChrome(fn, { log = true } = {}) {
  const port = 9333 + Math.floor(Math.random() * 500)
  const profile = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'cdp-'))
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], {
    stdio: 'ignore',
  })
  try {
    let targets
    for (let i = 0; i < 100 && !targets; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      } catch {
        await sleep(100)
      }
    }
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r))
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result ?? msg.error)
        pending.delete(msg.id)
      }
      if (!log) return
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type !== 'debug') {
        console.log(`[console.${msg.params.type}]`, msg.params.args.map((a) => a.value ?? a.description).join(' '))
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.log('[exception]', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
      }
    })
    const send = (method, params = {}) =>
      new Promise((res) => {
        const i = ++id
        pending.set(i, res)
        ws.send(JSON.stringify({ id: i, method, params }))
      })
    await send('Runtime.enable')
    await send('Page.enable')
    const page = {
      send,
      sleep,
      async evaluate(expression) {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
        return r.result?.value
      },
      async screenshot() {
        const { data } = await send('Page.captureScreenshot', { format: 'png' })
        return Buffer.from(data, 'base64')
      },
    }
    const result = await fn(page)
    ws.close()
    return result
  } finally {
    chrome.kill()
    await sleep(200)
    rmSync(profile, { recursive: true, force: true })
  }
}
