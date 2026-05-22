/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import bcd from '@mdn/browser-compat-data' with { type: 'json' };
import type { Identifier } from '@mdn/browser-compat-data';
import _virtual from '@rollup/plugin-virtual';
import globals from 'globals';
import { defineConfig, type TsdownPlugin as Plugin } from 'tsdown';

const virtual = _virtual as unknown as typeof _virtual.default;

const buildBlacklist = (): Set<string> => {
  const blacklist = new Set<string>();

  // 1. ECMAScript builtins
  const collectKeys = (obj: Identifier) => {
    for (const [key, val] of Object.entries(obj)) {
      if (key === '__compat') {
        continue;
      }
      blacklist.add(key);
      if (val && typeof val === 'object') {
        collectKeys(val as Identifier);
      }
    }
  };
  collectKeys((bcd.javascript as { builtins: Identifier }).builtins);

  // 2. Global identifiers
  for (const obj of Object.values(globals)) {
    for (const name of Object.keys(obj)) {
      blacklist.add(name);
    }
  }

  // 3. Prototype pollution vectors
  for (const name of [
    '__proto__',
    'prototype',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
  ]) {
    blacklist.add(name);
  }

  return blacklist;
};

export const commonPlugins = (): Plugin[] => {
  const blacklist = buildBlacklist();
  return [
    virtual({
      'virtual:blacklist': `export default new Set(${JSON.stringify([...blacklist].sort())});`,
    }),
  ];
};

export default defineConfig([
  {
    entry: ['src/*.ts', '!src/*.d.ts'],
    clean: true,
    dts: true,
    sourcemap: true,
    fixedExtension: false,
    plugins: [...commonPlugins()],
  },
]);
