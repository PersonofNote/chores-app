import { describe, expect, it } from 'vitest'
import { parseArt } from './parse'
import { artTemplate, TEMPLATES } from './templates'

describe('art templates', () => {
  it('committed files match the generator (run `npm run art-templates`)', () => {
    const files = import.meta.glob<string>('../../../art/templates/*.svg', { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(files)).toHaveLength(TEMPLATES.length)
    for (const spec of TEMPLATES) expect(files[`../../../art/templates/${spec.name}.svg`], spec.name).toBe(artTemplate(spec))
  })

  it('a drawing saved from a template keeps only the art', () => {
    for (const spec of TEMPLATES) {
      const drawn = artTemplate(spec).replace('<g id="art" inkscape:label="Art" inkscape:groupmode="layer">', '$&<rect width="10" height="10" fill="#c96"/>')
      const art = parseArt(drawn, 't')
      expect(art.fit.kind).toBe(spec.fit)
      expect(art.nodes).toEqual([{ tag: 'g', attrs: { id: 't-art' }, children: [{ tag: 'rect', attrs: { width: '10', height: '10', fill: '#c96' }, children: [] }] }])
    }
  })

  it('the page is the art box at the default size', () => {
    expect(parseArt(artTemplate(TEMPLATES[1]!), 't').viewBox).toEqual({ x: 0, y: 0, w: 84, h: 36 })
  })
})
