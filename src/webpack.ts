/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { createWebpackPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createWebpackPlugin(unpluginFactory);
export type { Options };
