// Renders the app icon SVG to the PNG sizes platforms want. Run after editing
// public/icons/icon.svg:  npm run icons
import { readFileSync, writeFileSync } from 'node:fs'
import { withChrome } from './cdp.mjs'

const svg = readFileSync('public/icons/icon.svg', 'utf8')
const OUTPUTS = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/apple-touch-icon.png', 180],
]

await withChrome(async (page) => {
  for (const [file, size] of OUTPUTS) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false })
    const html = `<html><body style="margin:0"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`
    await page.send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` })
    await page.sleep(300)
    writeFileSync(file, await page.screenshot())
    console.log('wrote', file)
  }
}, { log: false })
