import { describe, expect, it } from 'vitest'
import { parseArt } from './parse'

const INKSCAPE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Created with Inkscape -->
<svg width="96" height="48" viewBox="0 0 96 48" version="1.1"
  xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  data-fit="segments" data-caps="20 16" data-label="Butcher block">
  <sodipodi:namedview id="namedview1" pagecolor="#ffffff"><inkscape:page x="0" y="0"/></sodipodi:namedview>
  <metadata><rdf:RDF><cc:Work/></rdf:RDF></metadata>
  <defs id="defs1">
    <linearGradient id="linearGradient1"><stop offset="0" style="stop-color:#c08040;stop-opacity:1"/></linearGradient>
  </defs>
  <g inkscape:label="Guides" inkscape:groupmode="layer" id="layer-guides"><rect width="96" height="48" fill="red"/></g>
  <g id="guides"><rect width="96" height="48"/></g>
  <g inkscape:label="Art" id="layer1">
    <rect x="2" y="2" width="92" height="44" rx="4" style="fill:url(#linearGradient1);stroke:#5a3a1a;stroke-width:2;font-family:Comic" onclick="alert(1)"/>
    <path d="M10 10h20" fill="#000" style="display:none"/>
    <circle cx="10" cy="10" r="3" fill="url(https://evil.example/x.svg#a)"/>
    <use href="#linearGradient1"/><use xlink:href="https://evil.example/x.svg"/>
    <text x="1" y="1">hi</text>
    <script>alert(1)</script>
    <image href="https://evil.example/x.png"/>
  </g>
</svg>`

describe('parseArt', () => {
  const art = parseArt(INKSCAPE, 'art-counter-block')
  const layer = art.nodes.find((n) => n.attrs.id === 'art-counter-block-layer1')!

  it('reads the box, fit, caps and label from the root', () => {
    expect(art.viewBox).toEqual({ x: 0, y: 0, w: 96, h: 48 })
    expect(art.fit).toEqual({ kind: 'segments', caps: [20, 16] })
    expect(art.label).toBe('Butcher block')
  })

  it('keeps fills, splitting style into allowed attributes', () => {
    const rect = layer.children.find((n) => n.tag === 'rect')!
    expect(rect.attrs).toEqual({
      x: '2', y: '2', width: '92', height: '44', rx: '4',
      fill: 'url(#art-counter-block-linearGradient1)', stroke: '#5a3a1a', 'stroke-width': '2',
    })
  })

  it('keeps gradients, prefixing ids and local references', () => {
    const defs = art.nodes.find((n) => n.tag === 'defs')!
    expect(defs.children[0]).toMatchObject({ tag: 'linearGradient', attrs: { id: 'art-counter-block-linearGradient1' } })
    expect(defs.children[0]!.children[0]!.attrs).toEqual({ offset: '0', 'stop-color': '#c08040', 'stop-opacity': '1' })
    const uses = layer.children.filter((n) => n.tag === 'use')
    expect(uses.map((u) => u.attrs.href)).toEqual(['#art-counter-block-linearGradient1', undefined])
  })

  it('drops editor cruft, guides, hidden shapes, text, scripts, images and remote urls', () => {
    const tags = (nodes: typeof art.nodes): string[] => nodes.flatMap((n) => [n.tag, ...tags(n.children)])
    expect(tags(art.nodes)).toEqual(['defs', 'linearGradient', 'stop', 'g', 'rect', 'circle', 'use', 'use'])
    const circle = layer.children.find((n) => n.tag === 'circle')!
    expect(circle.attrs.fill).toBeUndefined()
  })

  it('keeps root presentation as a wrapper group', () => {
    const art = parseArt('<svg viewBox="0 0 10 10" fill="none" stroke="#000"><path d="M0 0h10"/></svg>', 'p')
    expect(art.nodes).toEqual([{ tag: 'g', attrs: { fill: 'none', stroke: '#000' }, children: [{ tag: 'path', attrs: { d: 'M0 0h10' }, children: [] }] }])
  })

  it('defaults to contain, and to quarter caps for segments without data-caps', () => {
    expect(parseArt('<svg width="48" height="48"></svg>', 'p').fit).toEqual({ kind: 'contain' })
    expect(parseArt('<svg viewBox="0 0 96 48" data-fit="segments"></svg>', 'p').fit).toEqual({ kind: 'segments', caps: [24, 24] })
  })

  it('needs a box', () => {
    expect(() => parseArt('<svg><path d="M0 0"/></svg>', 'p')).toThrow(/viewBox/)
  })
})
