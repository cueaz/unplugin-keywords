import type { UnpluginFactory } from 'unplugin';
import { createUnplugin } from 'unplugin';
import loadXXHash, { type XXHashAPI } from 'xxhash-wasm';
import { PLUGIN_NAME, VIRTUAL_MODULE_ID } from './internal/constants';
import type { Options } from './types';

const resolveId = (id: string): string => `\0${id}`;
const splitQuery = (id: string): [string, string | undefined] => {
  const index = id.indexOf('?');
  if (index === -1) {
    return [id, undefined];
  }
  return [id.slice(0, index), id.slice(index + 1)];
};

const toIncludes = (id: string): RegExp[] => [
  new RegExp(`^${id}$`),
  new RegExp(`^${id}/`),
];

const RESOLVED_VIRTUAL_MODULE_ID = resolveId(VIRTUAL_MODULE_ID);
const COMMON_EXCLUDES = [/\/node_modules\//];

export const unpluginFactory: UnpluginFactory<Options> = (options) => {
  let xxhash: XXHashAPI;

  return {
    name: PLUGIN_NAME,

    async buildStart() {
      xxhash = await loadXXHash();
    },

    resolveId: {
      filter: {
        id: {
          include: toIncludes(VIRTUAL_MODULE_ID),
          exclude: COMMON_EXCLUDES,
        },
      },
      handler(id, importer) {
        return;
      },
    },

    load: {
      filter: {
        id: {
          include: toIncludes(RESOLVED_VIRTUAL_MODULE_ID),
          exclude: COMMON_EXCLUDES,
        },
      },
      handler(id) {
        return;
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
        return;
      },
    },
  };
};

export default createUnplugin(unpluginFactory);
export type { Options } from './types';
