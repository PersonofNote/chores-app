// Dev tool: screenshot a page in headless Chrome and print its console output and
// exceptions. Usage: node scripts/screenshot.mjs <url> <out.png> [light|dark] [wait-ms]
import { writeFileSync } from 'node:fs'
import { withChrome } from './cdp.mjs'

const [url, out, scheme = 'light', wait = '3000'] = process.argv.slice(2)
await withChrome(async (page) => {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false })
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
  await page.send('Page.navigate', { url })
  await page.sleep(Number(wait))
  writeFileSync(out, await page.screenshot())
  console.log('saved', out)
})
