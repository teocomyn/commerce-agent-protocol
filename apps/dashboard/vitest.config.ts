import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json, so route handlers can be imported in tests.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
})
