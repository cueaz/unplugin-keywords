# `@preact/signals-core` Keywordification Demo

This directory contains a practical, real-world demonstration of `unplugin-keywords` applied to the core logic of the [`@preact/signals-core`](https://github.com/preactjs/signals) library.

## Purpose

The goal of this demo is to demonstrate the impact of structural string obfuscation on a complex codebase.

- `src/original.ts`: The baseline implementation of signals.
- `src/keywordified.ts`: The exact same logic, but with internal properties and methods explicitly routed through the `~keywords` and `~keywords/public` namespaces.

By comparing the minified outputs in `dist_sample/` (see [`original.min.js`](./dist_sample/original.min.js) and [`keywordified.min.js`](./dist_sample/keywordified.min.js)), you can observe how `unplugin-keywords` replaces semantic internal properties (e.g., `_nextBatchedEffect`, `_batchSnapshotVersion`), mapping them to short sequential identifiers and reducing the final bundle size.

## Verification

The obfuscation process is validated across two constraints: Size Reduction and Logical Correctness.

### 1. Bundle Size Output

Compilation via `tsdown` confirms the uncompressed byte reduction and the gzip size reduction.

```bash
$ NO_IMAGE=1 pnpm build --no-color
  ...
  ℹ dist/original.min.js      6.86 kB │ gzip: 2.09 kB
  ℹ dist/keywordified.min.js  5.17 kB │ gzip: 2.01 kB
  ℹ 2 files, total: 12.03 kB
  ✔ Build complete in 324ms
```

### 2. Logical Correctness

To ensure logical correctness, the original `@preact/signals-core` test suite (commit [`054afc1`](https://github.com/preactjs/signals/blob/054afc1c7deef23b48df74941c9ab57235dc894e/packages/core/test/signal.test.tsx), 158 tests) was fully ported. These tests are executed against a 2×2 matrix: `[Original, Keywordified] × [isDev: true, false]`.

```bash
$ pnpm test --no-color
  ...
  Test Files  4 passed (4)
       Tests  632 passed (632)
    Start at  16:21:53
    Duration  2.06s (transform 2.71s, setup 0ms, import 3.16s, tests 269ms, environment 0ms)
```

## License Notice

The source code used in this demonstration is derived and modified from `@preact/signals-core`.

**The MIT License (MIT)**

Copyright (c) 2022-present Preact Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
