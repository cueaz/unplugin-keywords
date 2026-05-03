import type { UnpluginFactory } from 'unplugin';
import { createUnplugin } from 'unplugin';
import loadXXHash, { type XXHashAPI } from 'xxhash-wasm';
import { PLUGIN_NAME, VIRTUAL_MODULE_ID } from './internal/constants';
import { encodeIdentifier } from './internal/encode';
import { toShortHash } from './internal/hash';
import {
  COMMON_EXCLUDES,
  resolveId,
  splitQuery,
  toIncludes,
} from './internal/plugin';
import { transformCode } from './internal/transform';
import type { Options } from './types';

export const unpluginFactory: UnpluginFactory<Options> = ({ isDev, seed }) => {
  let xxhash: XXHashAPI;
  let resolvedMap: Map<string, string>;

  return {
    name: PLUGIN_NAME,

    async buildStart() {
      xxhash = await loadXXHash();
      resolvedMap = new Map();
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
          include: [/\.m?[jt]sx?$/],
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
          const resolvedId = resolveId(`${VIRTUAL_MODULE_ID}/${encoded}`);
          const hash = toShortHash(xxhash, keyword, seed);
          const value = isDev ? `${hash}_${encoded}` : hash;
          resolvedMap.set(
            resolvedId,
            `export default ${JSON.stringify(value)};`,
          );
        }
        return { code: transformed, map };
      },
    },
  };
};

export default createUnplugin(unpluginFactory);
export type { Options } from './types';
