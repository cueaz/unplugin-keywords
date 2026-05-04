import { createEsbuildPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin';

export default createEsbuildPlugin(unpluginFactory);
export type { Options };
