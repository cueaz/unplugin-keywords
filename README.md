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

A build plugin for structural string literal minification and obfuscation

`unplugin-keywords` addresses a fundamental limitation in JavaScript minification: the inability to safely mangle string literals. Object keys, custom event types, and structural constants are left intact by standard minifiers, inflating bundle size and exposing internal architecture.

By explicitly importing these identifiers from a virtual module, the plugin extracts them at the AST level and maps them to short sequential identifiers or deterministic hashes during the build process. This explicit opt-in mechanism allows bundlers to inline and obfuscate application internals without breaking semantic contracts.

## How It Works

Standard minifiers leave structural strings untouched. `unplugin-keywords` makes them optimizable by treating them as imported module bindings.

**1. Source Code (Development):**
Developers reference strings via a virtual module. The strongly recommended pattern is to use a namespace import (`import * as K`), which clearly marks keyword usage throughout the file.

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
const _="b";const a={a:_,c:data};
```
<!-- prettier-ignore-end -->

## Visual Demo: `@preact/signals-core`

A side-by-side comparison of minified bundles:

|                                                                                                                                [Unmodified](https://github.com/cueaz/unplugin-keywords/blob/main/demo/signals/src/original.ts) (Standard Minification)                                                                                                                                |                                                                                                                                    [Keywordified](https://github.com/cueaz/unplugin-keywords/blob/main/demo/signals/src/keywordified.ts) (Literal Obfuscation)                                                                                                                                    |
| :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| <picture><source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/original.min.js.light.png" width="400"><img src="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/original.min.js.dark.png" width="400" alt="Original"></picture> | <picture><source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/keywordified.min.js.light.png" width="400"><img src="https://raw.githubusercontent.com/cueaz/unplugin-keywords/refs/heads/main/demo/signals/dist_sample/keywordified.min.js.dark.png" width="400" alt="Keywordified"></picture> |
|                                                                                                                                                                                6.86 kB │ gzip: 2.09 kB                                                                                                                                                                                |                                                                                                                                                                                      5.17 kB │ gzip: 2.01 kB                                                                                                                                                                                      |

> [!NOTE]
> **Baseline Metrics:** Both the "Unmodified" and "Keywordified" metrics represent standard `tsdown` minification. For comparison, the official [`@preact/signals-core@1.14.1`](https://bundlephobia.com/package/@preact/signals-core@1.14.1) release achieves a 5.4 kB Minified / 1.9 kB Gzipped footprint by employing a hand-crafted [`mangle.json`](https://github.com/preactjs/signals/blob/main/mangle.json) for manual property obfuscation.
>
> **Compression Efficiency:** While the uncompressed bundle size is reduced by 24.6%, the gzipped size is only 3.8% smaller. This demonstrates the effectiveness of standard gzip compression on unmodified code: if minimizing the gzipped network payload is the sole objective, adopting this plugin is unnecessary.

_For more information, see the [demo documentation](https://github.com/cueaz/unplugin-keywords/blob/main/demo/signals/README.md)._

## Integration

Install the package:

```bash
npm install -D unplugin-keywords
```

The plugin is built on [unplugin](https://github.com/unjs/unplugin). Tested with Vite, Rollup, and Rolldown. Other unplugin-compatible bundlers (webpack, esbuild, Rspack, Farm, Bun) are supported via the common API.

Configure your bundler. Example for Vite:

```ts
import { defineConfig } from 'vite';
import keywords from 'unplugin-keywords/vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    keywords({
      isDev: mode === 'development',
      secret: 'my-secret-key',
    }),
  ],
}));
```

**Plugin Options:**

- **`isDev`** _(boolean)_: When `true`, preserves the original keyword as a suffix in the generated identifier (e.g., `"zXpL21k.SET_USER"` instead of `"zXpL21k"`). This makes keyword origins traceable during development without affecting runtime behavior.
- **`secret`** _(string)_: Seed for the hashing and counter algorithms. Changing the secret rotates all generated identifiers globally—both the sequential counters (`~keywords`) and the deterministic hashes (`~keywords/public`).

To enable type checking and IDE auto-completion, execute the CLI. It will automatically generate type declarations and a `package.json` inside `node_modules/~keywords`, allowing your project to resolve the virtual modules:

```bash
npx keywords
```

> [!TIP]
> During development, the plugin automatically runs a background type generation process while the bundler is running. Manual CLI execution is only necessary for pre-flight type checking (e.g., in CI) before the bundler runs.

When depending on a library that has `"keywordified": true` (where `import * as K from '~keywords'` remains intact), configure `paths` in your `tsconfig.json` to enable proper module resolution:

```json
{
  "compilerOptions": {
    "paths": {
      "~keywords": ["./node_modules/~keywords/index.d.ts"],
      "~keywords/*": ["./node_modules/~keywords/*.d.ts"]
    }
  }
}
```

## Tri-Module System

`unplugin-keywords` provides three virtual modules. In practice, `~keywords` alone covers the vast majority of use cases—including library exports (see [Library Integration](#library-integration)).

- **`~keywords` (Lexical Counter):**
  Generates the shortest safe sequential identifiers (min length: 1, e.g., `"a"`, `"b"`). This is the **default and recommended module** for all use cases: internal state, private members, public API surfaces, and library exports. When all packages pass through the same bundler—either directly or via the `keywordified: true` marker—the lexical dictionary is automatically synchronized.
  _Convention:_ `import * as K from '~keywords';`

- **`~keywords/public` (Stable Hash):**
  Generates deterministic, key-derived hashes (e.g., `"z2pL21k"`). Reserved for contracts between **independently built applications** where dictionary synchronization is impossible—such as RPC schemas between separately deployed services, or `globalThis` variable sharing between isolated bundles. If both sides can pass through the same bundler, prefer `~keywords` instead.
  _Convention:_ `import * as PK from '~keywords/public';`

- **`~keywords/raw` (Literal String):**
  Yields the exact, unobfuscated string literal (e.g., `"function"`, `"click"`). Provided for completeness. In practice, modern minifiers and gzip compression already handle string deduplication effectively, making this module unnecessary for most codebases.
  _Convention:_ `import * as RK from '~keywords/raw';`

**Choosing a Module:**
Use `K` by default. The decision to reach for `PK` should be driven by a single question: _"Can both sides of this contract pass through the same bundler?"_ If yes, use `K`. If no (e.g., two separately deployed services communicating via RPC), use `PK`.

## Library Integration

When publishing libraries intended for consumers who also use `unplugin-keywords`, do not use the plugin during your library's build step. Instead, solely use the `keywords` CLI to generate types for development experience.

Publish your `dist` code (.js & .d.ts) with the `import * as K from '~keywords'` statements intact, and add the `"keywordified": true` marker to your `package.json`:

```json
{
  "name": "my-keywordified-lib",
  "keywordified": true
}
```

During the final app build, the consumer's bundler will automatically include your library and process both their app and your library simultaneously. This syncs the lexical dictionary across package boundaries without requiring stable hashes (`~keywords/public`).

## Motivation vs. Property Mangling

Traditional JavaScript minifiers rely on property mangling (e.g., Terser's `mangle.properties`) to reduce structural identifiers. `unplugin-keywords` provides a module-based alternative that addresses the structural limitations of global mangling.

- **Explicit Opt-In:**
  Traditional property mangling requires maintaining complex, global exclusion rules (e.g., [`mangle.json`](https://github.com/preactjs/signals/blob/main/mangle.json)), which are fragile and hard to scale. `unplugin-keywords` utilizes explicit imports (`import * as K from '~keywords'`). Developers clearly state which identifiers are safe to obfuscate directly in the source code.
- **Gradual Adoption:**
  Unlike global mangling flags that affect the entire codebase simultaneously, installing this plugin alters nothing by default. It allows incremental adoption on a per-file or per-module basis.
- **Cross-Boundary Consistency:**
  Standard mangled properties cannot safely cross package boundaries; a property mangled to `a` in Package A will not map to `a` in Package B. With `unplugin-keywords`, libraries ship `import * as K from '~keywords'` statements intact (via `keywordified: true`), and the consumer's bundler synchronizes the dictionary at build time. For independently built applications where bundler-level synchronization is impossible (e.g., separately deployed services), `~keywords/public` provides deterministic hashing to preserve structural contracts.
- **Universal Application:**
  Standard minifiers only mangle object keys, leaving string literal values intact. This plugin processes both keys and values uniformly (e.g., `[K.type]: K.SET_USER`). It extends obfuscation to literal types (`const mode: typeof K.extract | typeof K.transform = K.extract`) and even arbitrary static strings (`throw new Error(K['Invalid State'])`).
- **Trade-offs:**
  This explicit approach sacrifices some source code readability. Furthermore, as demonstrated in the benchmarks above, standard gzip compression handles unmodified semantic strings highly effectively. If reducing the gzipped network payload is the sole objective, the effort of adopting this plugin may not justify the minimal payload reduction.

## Example: Class-Based Architectures

The namespace import pattern is applicable in class-based architectures where structural symbols are heavily used for internal state and lifecycle methods.

> [!IMPORTANT]
> Overriding lifecycle methods (e.g., `[K.render]`) requires a modified base class—such as a custom build of Lit—compiled with `unplugin-keywords` to dispatch the hashed keys. Sharing this dictionary across the ecosystem enables consistent obfuscation.

```ts
// Source: https://github.com/lit/lit/blob/main/packages/lit-html/src/directives/async-replace.ts
/**
 * @license
 * Copyright 2026-present cueaz (Modifications)
 * Copyright 2017 Google LLC (Original Work)
 *
 * This snippet has been modified from its original version.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as K from '~keywords';

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

  [K.render]<T>(_value: AsyncIterable<T>, _mapper?: Mapper<T>) {
    return noChange;
  }

  override [K.update](
    _part: ChildPart,
    [value, mapper]: DirectiveParameters<this>,
  ) {
    if (!this[K.isConnected]) {
      this[K.disconnected]();
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
    this[K.__weakThis][K.disconnect]();
    this[K.__pauser][K.pause]();
  }

  override [K.reconnected]() {
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
