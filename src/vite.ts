/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { createVitePlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createVitePlugin(unpluginFactory);
export type { Options };
