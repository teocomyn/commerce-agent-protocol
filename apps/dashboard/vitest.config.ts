import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json, so route handlers can be imported in tests.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    // Compiled output lives next to the sources; never collect its copies of the tests.
    exclude: [...configDefaults.exclude, '**/.next/**', '**/dist/**'],
  },
})
