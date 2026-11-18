// Writes the art drawing templates to art/templates/ from src/render/art/templates.ts,
// loaded through Vite so the template uses the same constants as the map.
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { TEMPLATES, artTemplate } = await server.ssrLoadModule('/src/render/art/templates.ts')
  const dir = new URL('../art/templates/', import.meta.url)
  await mkdir(dir, { recursive: true })
  for (const spec of TEMPLATES) {
    const file = new URL(`${spec.name}.svg`, dir)
    await writeFile(file, artTemplate(spec))
    console.log(`wrote art/templates/${spec.name}.svg`)
  }
} finally {
  await server.close()
}
