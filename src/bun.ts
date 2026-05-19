/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { createBunPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createBunPlugin(unpluginFactory);
export type { Options };
