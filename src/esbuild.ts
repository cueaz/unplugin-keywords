import { createEsbuildPlugin } from 'unplugin';
import { unpluginFactory } from '.';

export default createEsbuildPlugin(unpluginFactory);
export type { Options } from './types';
