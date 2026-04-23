import { defineConfig, loadEnv } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      {
        // Injects Firebase env vars into the service worker at build time.
        // Uses closeBundle (runs after Vite copies the public/ dir) so the
        // processed file always wins over the dev-mode placeholder in public/.
        name: 'firebase-sw-env',
        apply: 'build',
        closeBundle() {
          const template = readFileSync(resolve('src/firebase-messaging-sw.js'), 'utf-8');
          const out = template
            .replace(/__FIREBASE_API_KEY__/g,            env.VITE_FIREBASE_API_KEY || '')
            .replace(/__FIREBASE_AUTH_DOMAIN__/g,        env.VITE_FIREBASE_AUTH_DOMAIN || '')
            .replace(/__FIREBASE_PROJECT_ID__/g,         env.VITE_FIREBASE_PROJECT_ID || '')
            .replace(/__FIREBASE_STORAGE_BUCKET__/g,     env.VITE_FIREBASE_STORAGE_BUCKET || '')
            .replace(/__FIREBASE_MESSAGING_SENDER_ID__/g, env.VITE_FIREBASE_MESSAGING_SENDER_ID || '')
            .replace(/__FIREBASE_APP_ID__/g,             env.VITE_FIREBASE_APP_ID || '');

          writeFileSync(resolve('dist/firebase-messaging-sw.js'), out, 'utf-8');
        },
      },
    ],
  };
});
