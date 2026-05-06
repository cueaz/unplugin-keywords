# `@preact/signals-core` Keywordification Demo

This directory contains a practical, real-world demonstration of `unplugin-keywords` applied to the core logic of the highly optimized [`@preact/signals-core`](https://github.com/preactjs/signals) library.

## Purpose

The goal of this demo is to visualize the tangible impact of AST-level structural string obfuscation on a complex codebase.

- **`src/original.ts`**: The baseline implementation of signals.
- **`src/keywordified.ts`**: The exact same logic, but with internal properties and lifecycle methods explicitly routed through the `virtual:keywords` namespace.

By comparing the minified outputs in `dist_sample/`([`original.js`](./dist_sample/original.js), [`keywordified.js`](./dist_sample/keywordified.js)), you can observe how `unplugin-keywords` eradicates semantic internal properties (e.g., `_nextBatchedEffect`, `_batchSnapshotVersion`), mapping them to deterministic short hashes and further compressing the final production bundle.

> **Note on Compression Entropy:** While the uncompressed bundle size strictly decreases, the gzipped size increases. In [V1](https://github.com/cueaz/vite-plugin-keywords), properties were mapped to `Symbol()`, which resulted in repetitive syntax that LZ77 compression algorithms could effortlessly dictionary-match. V2 replaces this with high-entropy base62 hashes (`"a3B"`, `"zXp"`). The introduction of this structural randomness inherently reduces gzip compression efficiency, despite the smaller raw file size.

## Verification

You can empirically verify the exact byte sizes of the generated outputs using standard Unix utilities.

**Uncompressed Size:**
```bash
$ wc -c dist_sample/*.js
    5847 dist_sample/keywordified.js
    6634 dist_sample/original.js
```

**Gzipped Size:**
```bash
$ gzip -c dist_sample/original.js | wc -c
    2041
$ gzip -c dist_sample/keywordified.js | wc -c
    2374
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
