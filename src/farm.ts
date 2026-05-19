/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { createFarmPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createFarmPlugin(unpluginFactory);
export type { Options };
