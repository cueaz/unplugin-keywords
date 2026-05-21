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

`unplugin-keywords` addresses a fundamental limitation in JavaScript minification: the inability to safely mangle string literals used as object keys, custom event types, or structural constants. By explicitly importing these identifiers from a virtual module, the plugin extracts them at the AST level and maps them to deterministic, short hashes during the build process. This explicit opt-in mechanism empowers bundlers to inline and obfuscate application internals without breaking semantic contracts.

## Motivation vs. Property Mangling

Traditional JavaScript minifiers rely on property mangling (e.g., Terser's `mangle.properties`) to reduce structural identifiers. `unplugin-keywords` provides a module-based alternative that addresses the structural limitations of global mangling.

- **Explicit Opt-In:**
  Traditional property mangling requires maintaining complex, global exclusion rules (e.g., [`mangle.json`](https://github.com/preactjs/signals/blob/main/mangle.json)), which are fragile and hard to scale. `unplugin-keywords` utilizes explicit imports (`import * as K from '~keywords'`). Developers unambiguously declare which identifiers are safe to obfuscate directly in the source code.
- **Gradual Adoption:**
  Unlike global mangling flags that affect the entire codebase simultaneously, installing this plugin alters nothing by default. It allows incremental adoption on a per-file or per-module basis.
- **Cross-Boundary Consistency:**
  Standard mangled properties cannot safely cross package boundaries; a property mangled to `a` in Package A will not map to `a` in Package B. Because `~keywords/public` relies on deterministic hashing, identical keys inherently produce identical hashes across independent builds, preserving structural contracts.
- **Universal Application:**
  Standard minifiers only mangle object keys, leaving string literal values intact. This plugin processes both keys and values uniformly (e.g., `[K.type]: K.SET_USER`). It extends obfuscation to literal types (`const mode: typeof K.extract | typeof K.transform = K.extract`) and even arbitrary static strings (`throw new Error(K['Invalid State'])`).
- **Trade-offs:**
  This explicit approach sacrifices some source code readability. Furthermore, as demonstrated in the benchmarks below, standard gzip compression handles unmodified semantic strings highly effectively. If reducing the gzipped network payload is the sole objective, the effort of adopting this plugin may not justify the minimal payload reduction.

## Visual Demo: `@preact/signals-core`

A side-by-side comparison of minified bundles:

|                                                                                                                                [Unmodified](https://github.com/cueaz/unplugin-keywords/blob/main/demo/signals/src/original.ts) (Standard Minification)                                                                                                                                |                                                                                                                                    [Keywordified](https://github.com/cueaz/unplugin-keywords/blob/main/demo/signals/src/keywordified.ts) (Literal Obfuscation)                                                                                                                                    |
| :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| <picture><source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/original.min.js.light.png" width="400"><img src="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/original.min.js.dark.png" width="400" alt="Original"></picture> | <picture><source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/keywordified.min.js.light.png" width="400"><img src="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/keywordified.min.js.dark.png" width="400" alt="Keywordified"></picture> |
|                                                                                                                                                                                6.86 kB │ gzip: 2.09 kB                                                                                                                                                                                |                                                                                                                                                                                      5.40 kB │ gzip: 2.05 kB                                                                                                                                                                                      |

> [!NOTE]
> **Baseline Metrics:** Both the "Unmodified" and "Keywordified" metrics represent standard `tsdown` minification. The official [`@preact/signals-core@1.14.1`](https://bundlephobia.com/package/@preact/signals-core@1.14.1) release achieves a smaller footprint (5.4 kB Minified / 1.9 kB Gzipped) by employing a hand-crafted [`mangle.json`](https://github.com/preactjs/signals/blob/main/mangle.json) for manual property obfuscation.
>
> **Compression Efficiency:** While the uncompressed bundle size is reduced by 21.3%, the gzipped size is only 1.9% smaller. This demonstrates the effectiveness of standard gzip compression on unmodified code: if minimizing the gzipped network payload is the sole objective, adopting this plugin is unnecessary.

_For more information, see the [demo documentation](https://github.com/cueaz/unplugin-keywords/blob/main/demo/signals/README.md)._

## How It Works

Standard minifiers operate exclusively on variable bindings and function names, leaving structural strings intact. While this preserves the semantic contract, it inflates bundle size and exposes internal state architecture (e.g., Redux action types, state machine nodes).

`unplugin-keywords` solves this by treating structural strings as imported module bindings.

**1. Source Code (Development):**
Developers reference strings via a virtual module. The strongly recommended pattern is to use a namespace import (`import * as K`), which clearly demarcates keyword usage throughout the file.

```ts
import * as K from '~keywords';

const action = {
  [K.type]: K.SET_USER,
  [K.payload]: data,
};
```

**2. AST Transformation:**
During the build phase, the plugin traverses the AST, resolving bindings and statically resolving member expressions. It replaces valid identifier access with a generated AST node pointing to a minimal lexical sequence (or a deterministic hash, depending on the module).

**3. Minified Output (Production):**
The bundler receives the transformed code and processes the obfuscated literals. Depending on the frequency of usage, the minifier will either inline the short strings directly or assign them to variables to save bytes.

<!-- prettier-ignore-start -->
```ts
// Example of minifier output: strings may be inlined or assigned to variables if used multiple times
const _="b0";const a={a0:_,c0:data};
```
<!-- prettier-ignore-end -->

## Dual-Module Architecture

`unplugin-keywords` provides two distinct virtual modules. By default, the shortest possible compression is used, but the dual-module system allows for stable cross-boundary contracts when necessary.

- **`~keywords` (Lexical Counter):**
  Generates the shortest safe sequential identifiers (min length: 2, e.g., `"a0"`, `"b0"`). Intended for **internal and local** implementations where cross-boundary stability is irrelevant. This is the default for maximum minification.
  _Convention:_ `import * as K from '~keywords';`

- **`~keywords/public` (Stable Hash):**
  Generates deterministic, key-derived hashes (e.g., `"z2pL21k"`). Designed for **public-facing APIs** and structural contracts that must remain consistent across package boundaries (e.g., `package.json` exports).
  _Convention:_ `import * as PK from '~keywords/public';`

**Module Separation:**
To minimize bundle size, identifiers can be partitioned: use `PK.*` for properties exposed to consumers, and obscure all internal state and private members behind the default `K.*`.

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

To enable type checking and IDE auto-completion, execute the CLI. It will automatically generate type declarations and a `package.json` inside `node_modules/~keywords`, allowing your project to resolve the virtual modules:

```bash
npx keywords
```

> [!TIP]
> During development, the plugin automatically runs a background type generation process while the bundler is running. Manual CLI execution is only necessary for pre-flight type checking (e.g., in CI) before the bundler runs.

## Example: Class-Based Architectures

The namespace import pattern is applicable in class-based architectures where structural symbols are heavily used for internal state and lifecycle methods.

> [!IMPORTANT]
> Overriding lifecycle methods (e.g., `[K.render]`) requires a modified base class—such as a custom build of Lit—compiled with `unplugin-keywords` to dispatch the hashed keys. Sharing this dictionary across the ecosystem enables consistent obfuscation.

```ts
// Source: https://github.com/lit/lit/blob/main/packages/lit-html/src/directives/async-replace.ts
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as K from '~keywords';
import * as PK from '~keywords/public';

import {
  AsyncDirective,
  type DirectiveParameters,
} from '../async-directive.js';
import { type ChildPart, noChange } from '../lit-html.js';
import { forAwaitOf, Pauser, PseudoWeakRef } from './private-async-helpers.js';

type Mapper<T> = (v: T, index?: number) => unknown;

export class AsyncReplaceDirective extends AsyncDirective {
  private [K.__value]?: AsyncIterable<unknown>;
  private [K.__weakThis] = new PseudoWeakRef(this);
  private [K.__pauser] = new Pauser();

  [PK.render]<T>(_value: AsyncIterable<T>, _mapper?: Mapper<T>) {
    return noChange;
  }

  override [PK.update](
    _part: ChildPart,
    [value, mapper]: DirectiveParameters<this>,
  ) {
    if (!this[PK.isConnected]) {
      this[PK.disconnected]();
    }

    if (value === this[K.__value]) {
      return noChange;
    }
    this[K.__value] = value;
    let i = 0;
    const { [K.__weakThis]: weakThis, [K.__pauser]: pauser } = this;

    forAwaitOf(value, async (v: unknown) => {
      while (pauser[K.get]()) {
        await pauser[K.get]();
      }

      const _this = weakThis[K.deref]();
      if (_this !== undefined) {
        if (_this[K.__value] !== value) {
          return false;
        }
        if (mapper !== undefined) {
          v = mapper(v, i);
        }
        _this[PK.commitValue](v, i);
        i++;
      }
      return true;
    });

    return noChange;
  }

  protected [PK.commitValue](value: unknown, _index: number) {
    this[PK.setValue](value);
  }

  override [PK.disconnected]() {
    this[K.__weakThis][K.disconnect]();
    this[K.__pauser][K.pause]();
  }

  override [PK.reconnected]() {
    this[K.__weakThis][K.reconnect](this);
    this[K.__pauser][K.resume]();
  }
}
```

_In production, all internal properties (e.g., `__value`, `__pauser`) will be completely minified to short sequence identifiers (via `~keywords`), obfuscating internal property names from the bundled Lit component._

> [!TIP]
> Native ECMAScript private fields (`#prop`) are safely mangled by standard minifiers, eliminating the need for plugin obfuscation for internal class state.

## Other Supported Patterns

```ts
// Modular Imports
import { type, 'kebab-case' as kebab } from '~keywords';

// JSX Injection
const View = () => (
  <K.Container>
    <div />
  </K.Container>
);

// Advanced TypeScript Inference
interface StateMachine {
  [K.idle]: typeof K.active;
  value: (typeof K)['kebab-case'];
}

// Module Re-exports
export { internalState as state } from '~keywords';

// UNSUPPORTED: Export All (Lacks static traceability)
export * from '~keywords';
```

## License

MIT
