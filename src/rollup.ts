import { createRollupPlugin } from 'unplugin';
import { unpluginFactory } from '.';

export default createRollupPlugin(unpluginFactory);
export type { Options } from './types';
