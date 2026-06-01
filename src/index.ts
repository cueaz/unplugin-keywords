/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { createUnplugin } from 'unplugin';
import { type Options, unpluginFactory } from './internal/plugin.js';

export default createUnplugin(unpluginFactory);
export type { Options };
