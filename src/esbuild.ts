/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { createEsbuildPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createEsbuildPlugin(unpluginFactory);
export type { Options };
