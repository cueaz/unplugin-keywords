import { createUnplugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createUnplugin(unpluginFactory);
export type { Options };
