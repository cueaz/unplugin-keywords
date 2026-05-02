import type { UnpluginFactory } from 'unplugin';
import { createUnplugin } from 'unplugin';
import { PLUGIN_NAME } from './internal/constants';
import type { Options } from './types';

export const unpluginFactory: UnpluginFactory<Options> = (options) => {
  return {
    name: PLUGIN_NAME,
    transform(code) {
      return code.replace('__UNPLUGIN__', `Hello Unplugin! ${options}`);
    },
  };
};

export default createUnplugin(unpluginFactory);
