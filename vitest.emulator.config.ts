import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Tests that need the Firebase emulators: the rules tests and the Web SDK
 * smoke test. Kept out of `npm test` so the default suite runs without Java;
 * run via `npm run test:emulator`, which starts the emulators around them.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }],
  },
  // firebase.ts reads its config from import.meta.env, so the smoke test gets
  // an emulator config here. Not secrets — the emulator accepts any key.
  define: {
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('emulator-api-key'),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify('vd2-scope.firebaseapp.com'),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('vd2-scope'),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify('vd2-scope.firebasestorage.app'),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify('0'),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:0:web:emulator'),
    'import.meta.env.VITE_USE_EMULATORS': JSON.stringify('true'),
  },
  test: {
    environment: 'node',
    include: ['src/test/emulator/**/*.emulator.test.ts'],
    // The two files share one emulator; run them one after the other.
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
