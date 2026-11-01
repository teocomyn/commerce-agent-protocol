import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Compiled output lives next to the sources; never collect its copies of the tests.
    exclude: [...configDefaults.exclude, '**/dist/**'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
