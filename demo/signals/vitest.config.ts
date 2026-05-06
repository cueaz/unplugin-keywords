import keywords from 'unplugin-keywords/rollup';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [false, true].map((isDev) => ({
      plugins: [keywords({ isDev, secret: '' })],
      test: {
        include: ['test/**/*.test.ts'],
        execArgv: ['--expose-gc'],
      },
    })),
  },
});
