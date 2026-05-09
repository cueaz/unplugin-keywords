/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { createRollupPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createRollupPlugin(unpluginFactory);
export type { Options };
