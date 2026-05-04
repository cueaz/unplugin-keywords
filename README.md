# unplugin-keywords

A build plugin for structural string literal minification and obfuscation.

`unplugin-keywords` addresses a fundamental limitation in JavaScript minification: the inability to safely mangle string literals used as object keys, event names, or structural identifiers. By explicitly importing these identifiers from a virtual module, the plugin extracts them at the AST level and maps them to deterministic, short hashes during the build process. This explicit opt-in mechanism empowers bundlers to aggressively inline and obfuscate application internals without breaking semantic contracts.

## Mechanism of Action

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
During the build phase, the plugin traverses the AST, resolving bindings and statically resolving member expressions. It replaces valid identifier access with a generated AST node pointing to a deterministic base62 hash.

**3. Minified Output (Production)**
The bundler receives the transformed code and processes the hashed literals. Depending on the frequency of usage, the minifier will either inline the strings directly or extract them into single-character variables to save bytes.

```ts
// Example of minifier output: strings may be inlined or assigned to variables if used multiple times
const _="zXpL21k";const a={"a3fB9zX":_,"1kMw8pA":data};
```
*The resulting bundle is stripped of semantic strings, mapping internal application logic to deterministic hashes up to 7 characters in length.*

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
      // Preserves keyword suffix in development for debugging (e.g., "zXpL21k_SET_USER")
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

> **Note:** The `npx keywords` command must be re-run whenever you introduce a new keyword into your codebase to update the `.keywords.d.ts` declaration file.

```jsonc
{
  "compilerOptions": {
    "paths": {
      "virtual:keywords": ["./node_modules/.keywords.d.ts"]
    }
  }
}
```

## Real-World Usage: Architecture & Directives

The namespace import pattern shines in complex, class-based architectures where structural symbols are heavily used for internal state and lifecycle methods.

> **Note:** Overriding lifecycle methods (e.g., `[K.render]`) requires a modified base class—such as a custom build of Lit—compiled with `unplugin-keywords` to dispatch the hashed keys. Sharing this dictionary across the ecosystem enables total obfuscation.

```ts
import * as K from 'virtual:keywords';
import {
  AsyncDirective,
  type DirectiveParameters,
  directive,
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

  override [K.update](_part: ChildPart, [value, mapper]: DirectiveParameters<this>) {
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
*In production, all internal properties (e.g., `__value`, `commitValue`) will be completely minified to short hashes, removing all trace of internal implementation details from the bundled Lit component.*

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
