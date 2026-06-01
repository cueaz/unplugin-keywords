#!/usr/bin/env node
/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { createRunner } from '../dist/api.js';

const runner = createRunner();
await runner.run();
