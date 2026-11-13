/**
 * Vite build plugin: emits sw.js from build/sw.template.js with the exact list of
 * built files to precache and a version derived from their contents. Any change
 * to the build changes sw.js, which is what makes browsers pick up an update.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

export const SW_FILE = 'sw.js'
const TEMPLATE = new URL('./sw.template.js', import.meta.url)

/** Files a page might request: bundle output plus public files, excluding the worker itself. */
export function precacheList(files: readonly string[]): string[] {
  const urls = files.filter((f) => f !== SW_FILE && !f.endsWith('.map')).map((f) => `./${f}`)
  // The shell is requested as the directory URL; cache it under that name too.
  return ['./', ...[...new Set(urls)].sort()]
}

/** A short hash over every file's name and contents. */
export function cacheVersion(contents: ReadonlyMap<string, string | Uint8Array>): string {
  const hash = createHash('sha256')
  for (const name of [...contents.keys()].sort()) hash.update(name).update('\0').update(contents.get(name)!).update('\0')
  return hash.digest('hex').slice(0, 12)
}

export function renderServiceWorker(template: string, files: readonly string[], version: string): string {
  if (!template.includes('__PRECACHE_MANIFEST__') || !template.includes('__CACHE_VERSION__')) {
    throw new Error('Service worker template is missing its placeholders')
  }
  return template.replace('__PRECACHE_MANIFEST__', JSON.stringify(files)).replace('__CACHE_VERSION__', version)
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

export function serviceWorker(): Plugin {
  let publicDir = ''
  return {
    name: 'house-monitor:service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle(_options, bundle) {
      const contents = new Map<string, string | Uint8Array>()
      for (const [fileName, out] of Object.entries(bundle)) {
        contents.set(fileName, out.type === 'chunk' ? out.code : out.source)
      }
      if (publicDir) {
        for (const path of listFiles(publicDir)) contents.set(relative(publicDir, path).split(sep).join('/'), readFileSync(path))
      }
      const template = readFileSync(TEMPLATE, 'utf8')
      this.emitFile({
        type: 'asset',
        fileName: SW_FILE,
        source: renderServiceWorker(template, precacheList([...contents.keys()]), cacheVersion(contents)),
      })
    },
  }
}
