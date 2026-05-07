import { readFile } from 'node:fs/promises';
import pLimit from 'p-limit';
import type { UnpluginFactory } from 'unplugin';
import { createRunner } from './cli.js';
import {
  DEBUG_SEPARATOR,
  KEYWORD_ROUTE_SEGMENT,
  PLUGIN_NAME,
  VIRTUAL_MODULE_ID,
} from './constants.js';
import { encodeIdentifier } from './encode.js';
import { createHasher, type Hasher } from './hash.js';
import { extractKeywords, transformCode } from './transform.js';

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
  isDev: boolean;
  secret: string;
}

export const unpluginFactory: UnpluginFactory<Options> = ({
  isDev,
  secret,
}) => {
  const runner = createRunner({ silent: true });
  const runnerLimit = pLimit({ concurrency: 1 });
  const allKeywords = new Set<string>();

  let isInitialized = false;
  const runInit = async () => {
    try {
      const keywords = await runner.collect();
      for (const keyword of keywords) {
        allKeywords.add(keyword);
      }
      await runner.save(allKeywords);
      isInitialized = true;
    } catch {}
  };

  let hasher: Hasher;
  let resolvedMap: Map<string, string>;

  return {
    name: PLUGIN_NAME,

    buildStart() {
      hasher = createHasher(secret);
      resolvedMap = new Map();
      runnerLimit(async () => {
        if (!isInitialized) {
          await runInit();
        }
      });
    },

    resolveId: {
      filter: {
        id: {
          include: toIncludes(VIRTUAL_MODULE_ID),
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
          include: toIncludes(resolveId(VIRTUAL_MODULE_ID)),
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
          include: [VIRTUAL_MODULE_ID],
        },
      },
      handler(code, id) {
        const result = transformCode(code, id);
        if (!result) {
          return null;
        }
        const { code: transformed, map, keywords } = result;
        for (const keyword of keywords) {
          const encoded = encodeIdentifier(keyword);
          const resolvedId = resolveId(
            `${VIRTUAL_MODULE_ID}/${KEYWORD_ROUTE_SEGMENT}/${encoded}`,
          );
          const hash = hasher(keyword);
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
      for (const keyword of keywords) {
        if (!allKeywords.has(keyword)) {
          allKeywords.add(keyword);
          isAdded = true;
        }
      }
      if (!isInitialized || isAdded) {
        runnerLimit(async () => {
          if (!isInitialized) {
            await runInit();
          } else if (isAdded) {
            try {
              await runner.save(allKeywords);
            } catch {}
          }
        });
      }
    },
  };
};
