/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { createFarmPlugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createFarmPlugin(unpluginFactory);
export type { Options };
