/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/*.ts', '!src/*.d.ts'],
    clean: true,
    dts: true,
    sourcemap: true,
    fixedExtension: false,
  },
]);
