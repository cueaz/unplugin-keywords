/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { readFile } from 'node:fs/promises';
import pLimit from 'p-limit';
import type { UnpluginFactory } from 'unplugin';
import { createRunner } from './cli.js';
import {
  DEBUG_SEPARATOR,
  KEYWORD_ROUTE_SEGMENT,
  PLUGIN_NAME,
  VIRTUAL_MODULE_ID,
  VIRTUAL_PUBLIC_MODULE_ID,
} from './constants.js';
import { encodeIdentifier } from './encode.js';
import { createCounter, createHasher, type Hasher } from './hash.js';
import {
  extractKeywords,
  type KeywordSet,
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

const SUFFIX_REGEX = /\.m?[jt]sx?$/;
const COMMON_EXCLUDES = [/\/node_modules\//];

export interface Options {
  /**
   * If true, preserves the original keyword as a suffix in the generated
   * identifier for easier debugging (e.g., `"zXpL21k.SET_USER"`).
   */
  isDev: boolean;
  /**
   * The cryptographic key used to initialize the deterministic HMAC algorithm.
   * Modifying this value will globally rotate all generated hashes.
   * To ensure cross-boundary consistency between independent builds,
   * they must share the same secret key.
   */
  secret: string;
}

export const unpluginFactory: UnpluginFactory<Options> = ({
  isDev,
  secret,
}) => {
  const runner = createRunner({ silent: true });
  const runnerLimit = pLimit({ concurrency: 1 });
  const typegenKeywords: KeywordSet = { local: new Set(), public: new Set() };

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
      runnerLimit(async () => {
        if (!isInitialized) {
          await runInit();
        }
      });
    },

    async buildEnd() {
      // Flush the background queue
      await runnerLimit(() => Promise.resolve());
    },

    resolveId: {
      filter: {
        id: {
          include: [
            ...toIncludes(VIRTUAL_MODULE_ID),
            ...toIncludes(VIRTUAL_PUBLIC_MODULE_ID),
          ],
          exclude: COMMON_EXCLUDES,
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
            ...toIncludes(resolveId(VIRTUAL_MODULE_ID)),
            ...toIncludes(resolveId(VIRTUAL_PUBLIC_MODULE_ID)),
          ],
          exclude: COMMON_EXCLUDES,
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
          exclude: COMMON_EXCLUDES,
        },
        code: {
          include: [VIRTUAL_MODULE_ID, VIRTUAL_PUBLIC_MODULE_ID],
        },
      },
      handler(code, id) {
        const result = transformCode(code, id);
        if (!result) {
          return null;
        }
        const { code: transformed, map, keywords } = result;
        for (const keyword of keywords.local) {
          const encoded = encodeIdentifier(keyword);
          const resolvedId = resolveId(
            `${VIRTUAL_MODULE_ID}/${KEYWORD_ROUTE_SEGMENT}/${encoded}`,
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
            `${VIRTUAL_PUBLIC_MODULE_ID}/${KEYWORD_ROUTE_SEGMENT}/${encoded}`,
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
        return { code: transformed, map };
      },
    },

    async watchChange(id, { event }) {
      if (
        !SUFFIX_REGEX.test(id) ||
        COMMON_EXCLUDES.some((regex) => regex.test(id)) ||
        event === 'delete'
      ) {
        return;
      }
      let code: string;
      try {
        code = await readFile(id, 'utf-8');
      } catch {
        return;
      }
      const keywords = extractKeywords(code);
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
