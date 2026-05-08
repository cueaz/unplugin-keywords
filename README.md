# unplugin-keywords

[![NPM][npm-badge]][npm-url]
[![Github CI][ci-badge]][ci-url]
[![MIT licensed][license-badge]][license-url]

[npm-badge]: https://img.shields.io/npm/v/unplugin-keywords.svg
[npm-url]: https://www.npmjs.com/package/unplugin-keywords
[ci-badge]: https://github.com/cueaz/unplugin-keywords/actions/workflows/check.yaml/badge.svg
[ci-url]: https://github.com/cueaz/unplugin-keywords/actions/workflows/check.yaml
[license-badge]: https://img.shields.io/badge/license-MIT-blue.svg
[license-url]: https://github.com/cueaz/unplugin-keywords/blob/main/LICENSE

A build plugin for structural string literal minification and obfuscation.

`unplugin-keywords` addresses a fundamental limitation in JavaScript minification: the inability to safely mangle string literals used as object keys, event names, or structural identifiers. By explicitly importing these identifiers from a virtual module, the plugin extracts them at the AST level and maps them to deterministic, short hashes during the build process. This explicit opt-in mechanism empowers bundlers to inline and obfuscate application internals without breaking semantic contracts.

## Visual Demo: `@preact/signals-core`

A side-by-side comparison of the minified production bundles:

| [Unmodified](https://github.com/cueaz/unplugin-keywords/blob/main/demo/signals/src/original.ts) (Standard Minification) | [Keywordified](https://github.com/cueaz/unplugin-keywords/blob/main/demo/signals/src/keywordified.ts) (Literal Obfuscation) |
|:---:|:---:|
| <picture><source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/original.min.js.light.png" width="400"><img src="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/original.min.js.dark.png" width="400" alt="Original"></picture> | <picture><source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/keywordified.min.js.light.png" width="400"><img src="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/keywordified.min.js.dark.png" width="400" alt="Keywordified"></picture> |
| 6.86 kB │ gzip: **2.09 kB** | **5.40 kB** │ gzip: 2.03 kB |

*While the raw bundle size is reduced by 21.3%, the gzipped size is only 2.9% smaller. This side-by-side comparison demonstrates the effectiveness of the LZ77 algorithm on unmodified code: if minimizing the gzipped network payload is the sole objective, adopting this plugin is unnecessary.*

*For more information, see the [demo documentation](https://github.com/cueaz/unplugin-keywords/blob/main/demo/signals/README.md).*

## How It Works

Standard minifiers operate exclusively on variable bindings and function names, leaving structural strings intact. While this preserves the semantic contract, it inflates bundle size and exposes internal state architecture (e.g., Redux action types, state machine nodes).

`unplugin-keywords` shifts this paradigm by treating structural strings as imported module bindings.

**1. Source Code (Development)**
Developers reference strings via a virtual module. The strongly recommended pattern is to use a namespace import (`import * as K`), which clearly demarcates keyword usage throughout the file.

```ts
import * as K from 'virtual:keywords';

const action = {
  [K.type]: K.SET_USER,
  [K.payload]: data,
};
```

**2. AST Transformation**
During the build phase, the plugin traverses the AST, resolving bindings and statically resolving member expressions. It replaces valid identifier access with a generated AST node pointing to a deterministic base62 hash or a minimal lexical sequence.

**3. Minified Output (Production)**
The bundler receives the transformed code and processes the hashed literals. Depending on the frequency of usage, the minifier will either inline the strings directly or extract them into single-character variables to save bytes.

```ts
// Example of minifier output: strings may be inlined or assigned to variables if used multiple times
const _="z2pL21k";const a={a3fB9zX:_,k1Mw8pA:data};
```

## Dual-Module Architecture

`unplugin-keywords` provides two distinct virtual modules. While exclusively using `K.*` is a perfectly valid and robust approach, the dual-module system allows further bundle size reduction.

*   **`virtual:keywords` (Stable Hash)**
    Generates deterministic, key-derived hashes (e.g., `"z2pL21k"`). Designed for **public-facing APIs** and structural contracts that must remain consistent across package boundaries (e.g., `package.json` exports).
    *Convention:* `import * as K from 'virtual:keywords';`

*   **`virtual:keywords/lex` (Lexical Counter)**
    Generates the shortest possible sequential identifiers via bijection numeration (e.g., `"_a"`, `"_b"`, `"_c"`). Strictly designated for **internal and local** implementations where cross-boundary stability is irrelevant.
    *Convention:* `import * as L from 'virtual:keywords/lex';` (Think `L` for Local).

**Module Separation**
To minimize bundle size, identifiers can be partitioned: bind public interfaces to `K.*`, and obscure all internal state and private members behind `L.*`.

## Integration

Install the package:

```bash
npm install -D unplugin-keywords
```

Configure your bundler. Example for Vite:

```ts
import { defineConfig } from 'vite';
import keywords from 'unplugin-keywords/vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    keywords({
      // Preserves keyword suffix in development for debugging (e.g., "zXpL21k.SET_USER")
      isDev: mode === 'development',
      // Initializes the hashing algorithm. Modify to rotate hashes globally.
      secret: 'my-secret-key',
    }),
  ],
}));
```

To enable type checking and IDE auto-completion, execute the CLI and register the output in `tsconfig.json`:

```bash
npx keywords
```

```jsonc
{
  "compilerOptions": {
    "paths": {
      "virtual:keywords": ["./node_modules/.keywords/index.d.ts"],
      "virtual:keywords/lex": ["./node_modules/.keywords/lex.d.ts"]
    }
  }
}
```

> **Note:** During development, the plugin automatically runs a background type generation process while the bundler is running. Manual CLI execution is only necessary for pre-flight type checking (e.g., in CI) before the bundler runs.

## Real-World Usage: Class-Based Architectures

The namespace import pattern is applicable in class-based architectures where structural symbols are heavily used for internal state and lifecycle methods.

> **Note:** Overriding lifecycle methods (e.g., `[K.render]`) requires a modified base class—such as a custom build of Lit—compiled with `unplugin-keywords` to dispatch the hashed keys. Sharing this dictionary across the ecosystem enables consistent obfuscation.

```ts
// Source: https://github.com/lit/lit/blob/main/packages/lit-html/src/directives/async-replace.ts
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
import * as K from 'virtual:keywords';
import {
  AsyncDirective,
  type DirectiveParameters,
} from '../async-directive.js';
import { type ChildPart, noChange } from '../lit-html.js';
import { forAwaitOf, Pauser, PseudoWeakRef } from './private-async-helpers.js';

type Mapper<T> = (v: T, index?: number) => unknown;

export class AsyncReplaceDirective extends AsyncDirective {
  private [L.__value]?: AsyncIterable<unknown>;
  private [L.__weakThis] = new PseudoWeakRef(this);
  private [L.__pauser] = new Pauser();

  [K.render]<T>(_value: AsyncIterable<T>, _mapper?: Mapper<T>) {
    return noChange;
  }

  override [K.update](_part: ChildPart, [value, mapper]: DirectiveParameters<this>) {
    if (!this[K.isConnected]) {
      this[K.disconnected]();
    }

    if (value === this[L.__value]) {
      return noChange;
    }
    this[L.__value] = value;
    let i = 0;
    const { [L.__weakThis]: weakThis, [L.__pauser]: pauser } = this;

    forAwaitOf(value, async (v: unknown) => {
      while (pauser[L.get]()) {
        await pauser[L.get]();
      }

      const _this = weakThis[L.deref]();
      if (_this !== undefined) {
        if (_this[L.__value] !== value) {
          return false;
        }
        if (mapper !== undefined) {
          v = mapper(v, i);
        }
        _this[K.commitValue](v, i);
        i++;
      }
      return true;
    });

    return noChange;
  }

  protected [K.commitValue](value: unknown, _index: number) {
    this[K.setValue](value);
  }

  override [K.disconnected]() {
    this[L.__weakThis][L.disconnect]();
    this[L.__pauser][L.pause]();
  }

  override [K.reconnected]() {
    this[L.__weakThis][L.reconnect](this);
    this[L.__pauser][L.resume]();
  }
}
```
*In production, all internal properties (e.g., `__value`, `__pauser`) will be completely minified to short sequence identifiers (via `virtual:keywords/lex`), removing all trace of internal implementation details from the bundled Lit component.*

## Other Supported Patterns

```ts
// Modular Imports
import { type, 'kebab-case' as kebab } from 'virtual:keywords';

// JSX Injection
const View = () => (
  <K.Container>
    <type />
  </K.Container>
);

// Advanced TypeScript Inference
interface StateMachine {
  [K.idle]: typeof K.active;
  value: (typeof K)['kebab-case'];
}

// Module Re-exports
export { internalState as state } from 'virtual:keywords';
```

## License

MIT
