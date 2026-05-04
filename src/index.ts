import { createUnplugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin';

export default createUnplugin(unpluginFactory);
export type { Options };
