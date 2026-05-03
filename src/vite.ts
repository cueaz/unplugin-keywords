import { createVitePlugin } from 'unplugin';
import { unpluginFactory } from '.';

export default createVitePlugin(unpluginFactory);
export type { Options } from './types';
