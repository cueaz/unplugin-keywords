/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import keywords from 'unplugin-keywords/vite';
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
