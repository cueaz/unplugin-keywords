import { createVitePlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin';

export default createVitePlugin(unpluginFactory);
export type { Options };
