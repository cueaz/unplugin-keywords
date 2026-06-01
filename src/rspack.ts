/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { createRspackPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createRspackPlugin(unpluginFactory);
export type { Options };
