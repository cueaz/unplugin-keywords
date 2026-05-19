/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { createRolldownPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createRolldownPlugin(unpluginFactory);
export type { Options };
