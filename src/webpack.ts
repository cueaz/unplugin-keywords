import { createWebpackPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin';

export default createWebpackPlugin(unpluginFactory);
export type { Options };
