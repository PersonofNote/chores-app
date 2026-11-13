import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cacheVersion, precacheList, renderServiceWorker } from './service-worker'

describe('service worker build', () => {
  it('precaches the shell and every file except the worker and source maps', () => {
    expect(precacheList(['index.html', 'assets/index-abc.js', 'sw.js', 'assets/index-abc.js.map', 'icons/icon-192.png'])).toEqual([
      './',
      './assets/index-abc.js',
      './icons/icon-192.png',
      './index.html',
    ])
  })

  it('versions by content: same files → same version; any change → new version', () => {
    const a = new Map([['index.html', '<html>'], ['app.js', 'x']])
    expect(cacheVersion(a)).toBe(cacheVersion(new Map([...a].reverse())))
    expect(cacheVersion(a)).not.toBe(cacheVersion(new Map([...a, ['app.js', 'y']])))
  })

  it('fills the real template', () => {
    const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
    const out = renderServiceWorker(template, ['./', './index.html'], 'v123')
    expect(out).toContain(`const PRECACHE = ["./","./index.html"]`)
    expect(out).toContain(`const VERSION = 'v123'`)
    expect(out).not.toMatch(/__[A-Z_]+__/)
  })

  it('refuses a template without placeholders', () => {
    expect(() => renderServiceWorker('nothing here', [], 'v')).toThrow('placeholders')
  })
})
