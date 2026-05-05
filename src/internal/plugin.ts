import type { UnpluginFactory } from 'unplugin';
import { run } from './cli.js';
import { PLUGIN_NAME, VIRTUAL_MODULE_ID } from './constants.js';
import { encodeIdentifier } from './encode.js';
import { createHasher, type Hasher } from './hash.js';
import { transformCode } from './transform.js';

const resolveId = (id: string): string => `\0${id}`;

const splitQuery = (id: string): [string, string | undefined] => {
  const index = id.indexOf('?');
  if (index === -1) {
    return [id, undefined];
  }
  return [id.slice(0, index), id.slice(index + 1)];
};

const toIncludes = (id: string): RegExp[] => [new RegExp(`^${id}/`)];

const COMMON_EXCLUDES = [/\/node_modules\//];

export interface Options {
  isDev: boolean;
  secret: string;
}

export const unpluginFactory: UnpluginFactory<Options> = ({
  isDev,
  secret,
}) => {
  let hasher: Hasher;
  let resolvedMap: Map<string, string>;

  return {
    name: PLUGIN_NAME,

    buildStart() {
      hasher = createHasher(secret);
      resolvedMap = new Map();
      run({ silent: true });
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
          const hash = hasher(keyword);
          const value = isDev ? `${hash}|${encoded}` : hash;
          resolvedMap.set(
            resolvedId,
            `export default ${JSON.stringify(value)};\n`,
          );
        }
        return { code: transformed, map };
      },
    },
  };
};
