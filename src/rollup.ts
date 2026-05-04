import { createRollupPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin';

export default createRollupPlugin(unpluginFactory);
export type { Options };
