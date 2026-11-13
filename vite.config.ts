import { defineConfig } from 'vitest/config'
import { serviceWorker } from './build/service-worker.ts'

export default defineConfig({
  // Relative URLs, so the build works from any path (a subfolder, GitHub Pages...).
  base: './',
  plugins: [serviceWorker()],
  test: {
    include: ['src/**/*.test.ts', 'build/**/*.test.ts'],
  },
})
