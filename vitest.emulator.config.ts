import { defineConfig } from 'vitest/config'

/**
 * Tests that need the Firebase emulators. Kept out of `npm test` so the
 * default suite runs without Java; run via `npm run test:rules`, which starts
 * the emulators around it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/emulator/**/*.emulator.test.ts'],
    testTimeout: 20_000,
  },
})
