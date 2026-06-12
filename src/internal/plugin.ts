/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { readFile } from 'node:fs/promises';
import pLimit from 'p-limit';
import type { UnpluginFactory } from 'unplugin';
import { createRunner } from './cli.js';
import {
  DEBUG_SEPARATOR,
  KEYWORD_ROUTE,
  PLUGIN_NAME,
  VIRTUAL_INTERNAL_MODULE_ID,
  VIRTUAL_INTERNAL_PUBLIC_MODULE_ID,
  VIRTUAL_INTERNAL_RAW_MODULE_ID,
  VIRTUAL_MODULE_ID,
  VIRTUAL_PUBLIC_MODULE_ID,
  VIRTUAL_RAW_MODULE_ID,
} from './constants.js';
import { encodeIdentifier } from './encode.js';
import { createCounter, createHasher, type Hasher } from './hash.js';
import {
  extractKeywords,
  type KeywordSet,
  preprocessForExtract,
  transformCode,
} from './transform.js';

const resolveId = (id: string): string => `\0${id}`;

const splitQuery = (id: string): [string, string | undefined] => {
  const index = id.indexOf('?');
  if (index === -1) {
    return [id, undefined];
  }
  return [id.slice(0, index), id.slice(index + 1)];
};

const toIncludes = (id: string): RegExp[] => [new RegExp(`^${id}/`)];

const SUFFIX_REGEX = /\.(?:m?[jt]sx?|svelte)(?:$|\?)/;

export interface Options {
  /**
   * When `true`, preserves the original keyword as a suffix in the generated
   * identifier (e.g., `"zXpL21k.SET_USER"` instead of `"zXpL21k"`). This makes
   * keyword origins traceable during development without affecting runtime behavior.
   */
  isDev: boolean;
  /**
   * Seed for the hashing and counter algorithms. Changing the secret rotates
   * all generated identifiers globally—both the sequential counters (`~keywords`)
   * and the deterministic hashes (`~keywords/public`).
   */
  secret: string;
}

export const unpluginFactory: UnpluginFactory<Options> = ({
  isDev,
  secret,
}) => {
  const runner = createRunner({ silent: true });
  const runnerLimit = pLimit({ concurrency: 1 });
  const typegenKeywords: KeywordSet = {
    local: new Set(),
    public: new Set(),
    raw: new Set(),
  };

  let isInitialized = false;
  const runInit = async () => {
    try {
      const keywords = await runner.collect();
      for (const keyword of keywords.local) {
        typegenKeywords.local.add(keyword);
      }
      for (const keyword of keywords.public) {
        typegenKeywords.public.add(keyword);
      }
      for (const keyword of keywords.raw) {
        typegenKeywords.raw.add(keyword);
      }
      await runner.save(typegenKeywords);
      isInitialized = true;
    } catch {}
  };

  let hasherPublic: Hasher;
  let hasherLocal: Hasher;
  let resolvedMap: Map<string, string>;

  return {
    name: PLUGIN_NAME,

    buildStart() {
      hasherPublic = createHasher(secret);
      hasherLocal = createCounter(secret);
      resolvedMap = new Map();
      if (!isInitialized) {
        runnerLimit(async () => {
          if (!isInitialized) {
            await runInit();
          }
        });
      }
    },

    async buildEnd() {
      // Flush the background queue
      await runnerLimit(() => Promise.resolve());
    },

    resolveId: {
      filter: {
        id: {
          include: [
            ...toIncludes(VIRTUAL_INTERNAL_MODULE_ID),
            ...toIncludes(VIRTUAL_INTERNAL_PUBLIC_MODULE_ID),
            ...toIncludes(VIRTUAL_INTERNAL_RAW_MODULE_ID),
          ],
        },
      },
      handler(id) {
        return resolveId(id);
      },
    },

    load: {
      filter: {
        id: {
          include: [
            ...toIncludes(resolveId(VIRTUAL_INTERNAL_MODULE_ID)),
            ...toIncludes(resolveId(VIRTUAL_INTERNAL_PUBLIC_MODULE_ID)),
            ...toIncludes(resolveId(VIRTUAL_INTERNAL_RAW_MODULE_ID)),
          ],
        },
      },
      handler(id) {
        const [validId] = splitQuery(id);
        if (resolvedMap.has(validId)) {
          return resolvedMap.get(validId);
        }
        return null;
      },
    },

    transform: {
      filter: {
        id: {
          include: [SUFFIX_REGEX],
        },
        code: {
          include: [
            VIRTUAL_MODULE_ID,
            VIRTUAL_PUBLIC_MODULE_ID,
            VIRTUAL_RAW_MODULE_ID,
          ],
        },
      },
      handler(code, id) {
        const [validId] = splitQuery(id);
        const result = transformCode(code, validId);
        if (!result) {
          return null;
        }
        const { code: transformed, map, keywords } = result;
        for (const keyword of keywords.local) {
          const encoded = encodeIdentifier(keyword);
          const resolvedId = resolveId(
            `${VIRTUAL_INTERNAL_MODULE_ID}/${KEYWORD_ROUTE}/${encoded}`,
          );
          if (resolvedMap.has(resolvedId)) {
            continue;
          }
          const hash = hasherLocal(keyword);
          const value = isDev ? `${hash}${DEBUG_SEPARATOR}${keyword}` : hash;
          resolvedMap.set(
            resolvedId,
            `export default ${JSON.stringify(value)};\n`,
          );
        }
        for (const keyword of keywords.public) {
          const encoded = encodeIdentifier(keyword);
          const resolvedId = resolveId(
            `${VIRTUAL_INTERNAL_PUBLIC_MODULE_ID}/${KEYWORD_ROUTE}/${encoded}`,
          );
          if (resolvedMap.has(resolvedId)) {
            continue;
          }
          const hash = hasherPublic(keyword);
          const value = isDev ? `${hash}${DEBUG_SEPARATOR}${keyword}` : hash;
          resolvedMap.set(
            resolvedId,
            `export default ${JSON.stringify(value)};\n`,
          );
        }
        for (const keyword of keywords.raw) {
          const encoded = encodeIdentifier(keyword);
          const resolvedId = resolveId(
            `${VIRTUAL_INTERNAL_RAW_MODULE_ID}/${KEYWORD_ROUTE}/${encoded}`,
          );
          if (resolvedMap.has(resolvedId)) {
            continue;
          }
          resolvedMap.set(
            resolvedId,
            `export default ${JSON.stringify(keyword)};\n`,
          );
        }
        return { code: transformed, map };
      },
    },

    async watchChange(id, { event }) {
      if (!SUFFIX_REGEX.test(id) || event === 'delete') {
        return;
      }
      const [validId] = splitQuery(id);
      let code: string | null;
      try {
        code = await readFile(validId, 'utf-8');
      } catch {
        return;
      }
      code = await preprocessForExtract(code, validId);
      if (!code) {
        return;
      }
      const keywords = extractKeywords(code, validId);
      if (!keywords) {
        return;
      }
      let isAdded = false;
      for (const keyword of keywords.local) {
        if (!typegenKeywords.local.has(keyword)) {
          typegenKeywords.local.add(keyword);
          isAdded = true;
        }
      }
      for (const keyword of keywords.public) {
        if (!typegenKeywords.public.has(keyword)) {
          typegenKeywords.public.add(keyword);
          isAdded = true;
        }
      }
      for (const keyword of keywords.raw) {
        if (!typegenKeywords.raw.has(keyword)) {
          typegenKeywords.raw.add(keyword);
          isAdded = true;
        }
      }
      if (!isInitialized || isAdded) {
        runnerLimit(async () => {
          if (!isInitialized) {
            await runInit();
          } else if (isAdded) {
            try {
              await runner.save(typegenKeywords);
            } catch {}
          }
        });
      }
    },
  };
};
