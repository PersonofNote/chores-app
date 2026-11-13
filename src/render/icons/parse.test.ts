import { describe, expect, it } from 'vitest'
import { parseIcon } from './parse'

describe('parseIcon', () => {
  it('keeps shapes and their geometry, dropping root and presentation attributes', () => {
    const text = `<!-- license -->
      <svg class="x" width="24" stroke="red" stroke-width="2" viewBox="0 0 24 24">
        <path d="M1 1h2" stroke="blue" class="p" />
        <circle cx="5" cy="6" r="2" fill="red" />
        <rect width="4" height="3" x="1" y="2" rx="1" />
      </svg>`
    expect(parseIcon(text)).toEqual([
      { tag: 'path', attrs: { d: 'M1 1h2' } },
      { tag: 'circle', attrs: { cx: '5', cy: '6', r: '2' } },
      { tag: 'rect', attrs: { width: '4', height: '3', x: '1', y: '2', rx: '1' } },
    ])
  })

  it('lets nothing executable through', () => {
    const text = `<svg>
      <script>alert(1)</script>
      <path d="M0 0" onclick="alert(1)" style="x" />
      <a href="javascript:alert(1)"><circle cx="1" cy="1" r="1" /></a>
      <image href="x.png" />
      <foreignObject />
    </svg>`
    expect(parseIcon(text)).toEqual([
      { tag: 'path', attrs: { d: 'M0 0' } },
      { tag: 'circle', attrs: { cx: '1', cy: '1', r: '1' } },
    ])
  })
})
