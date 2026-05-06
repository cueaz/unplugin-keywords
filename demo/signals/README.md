# `@preact/signals-core` Keywordification Demo

This directory contains a practical, real-world demonstration of `unplugin-keywords` applied to the core logic of the highly optimized [`@preact/signals-core`](https://github.com/preactjs/signals) library.

## Purpose

The goal of this demo is to visualize the tangible impact of AST-level structural string obfuscation on a complex codebase.

- `src/original.ts`: The baseline implementation of signals.
- `src/keywordified.ts`: The exact same logic, but with internal properties and lifecycle methods explicitly routed through the `virtual:keywords` namespace.

By comparing the minified outputs in `dist_sample/` (see [`original.js`](./dist_sample/original.js) and [`keywordified.js`](./dist_sample/keywordified.js)), you can observe how `unplugin-keywords` eradicates semantic internal properties (e.g., `_nextBatchedEffect`, `_batchSnapshotVersion`), mapping them to deterministic short hashes and further compressing the final production bundle.

> **Note on Compression Entropy:** While the uncompressed bundle size strictly decreases, the gzipped size increases. In [V1](https://github.com/cueaz/vite-plugin-keywords), properties were mapped to `Symbol()`, which resulted in repetitive syntax that LZ77 compression algorithms could effortlessly dictionary-match. V2 replaces this with high-entropy base62 hashes (`"a3B"`, `"zXp"`). The introduction of this structural randomness inherently reduces gzip compression efficiency, despite the smaller raw file size.

## Verification

The obfuscation process is validated across two constraints: Size Reduction and Behavioral Equivalence.

### 1. Bundle Size Output
Compilation via `tsdown` confirms the uncompressed byte reduction and the expected gzip entropy shift.

```bash
$ NO_IMAGE=1 pnpm build --no-color
  ...
  ℹ dist/original.js      6.86 kB │ gzip: 2.09 kB
  ℹ dist/keywordified.js  6.02 kB │ gzip: 2.42 kB
  ℹ 2 files, total: 12.88 kB
  ✔ Build complete in 222ms
```

### 2. Behavioral Equivalence
To guarantee zero runtime regressions, the original `@preact/signals-core` test suite (commit [`054afc1`](https://github.com/preactjs/signals/blob/054afc1c7deef23b48df74941c9ab57235dc894e/packages/core/test/signal.test.tsx), 158 tests) was fully ported. These tests are executed against a 2×2 matrix: `[Original, Keywordified] × [isDev: true, false]`.

The resulting 632 test executions empirically prove semantic equivalence.

```bash
$ pnpm test --no-color
  ...
  Test Files  4 passed (4)
       Tests  632 passed (632)
    Start at  22:10:03
    Duration  820ms (transform 1.80s, setup 0ms, import 1.95s, tests 203ms, environment 0ms)
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
