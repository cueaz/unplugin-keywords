/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { defineConfig } from 'vitest/config';
import { commonPlugins } from './tsdown.config.js';

export default defineConfig({
  plugins: [...commonPlugins()],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
