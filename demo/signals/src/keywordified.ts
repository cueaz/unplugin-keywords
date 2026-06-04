/**
 * @license
 * Copyright 2026-present cueaz (Modifications)
 * Copyright 2022-present Preact Team (Original Work)
 *
 * This file has been modified from its original version.
 * SPDX-License-Identifier: MIT
 */

import * as K from '~keywords';
import * as PK from '~keywords/public';

// An named symbol/brand for detecting Signal instances even when they weren't
// created using the same signals library version.
// biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
const BRAND_SYMBOL = Symbol.for(PK['preact-signals']);

// Flags for Computed and Effect.
const RUNNING = 1 << 0;
const NOTIFIED = 1 << 1;
const OUTDATED = 1 << 2;
const DISPOSED = 1 << 3;
const HAS_ERROR = 1 << 4;
const TRACKING = 1 << 5;

// A linked list node used to track dependencies (sources) and dependents (targets).
// Also used to remember the source's last version number that the target saw.
type Node = {
  // A source whose value the target depends on.
  [K._source]: Signal;
  [K._prevSource]?: Node | undefined;
  [K._nextSource]?: Node | undefined;

  // A target that depends on the source and should be notified when the source changes.
  [K._target]: Computed | Effect;
  [K._prevTarget]?: Node | undefined;
  [K._nextTarget]?: Node | undefined;

  // The version number of the source that target has last seen. We use version numbers
  // instead of storing the source value, because source values can take arbitrary amount
  // of memory, and computeds could hang on to them forever because they're lazily evaluated.
  // Use the special value -1 to mark potentially unused but recyclable nodes.
  [K._version]: number;

  // Used to remember & roll back the source's previous `[K._node]` value when entering &
  // exiting a new evaluation context.
  [K._rollbackNode]?: Node | undefined;
};

function startBatch() {
  batchDepth++;
}

function endBatch() {
  if (batchDepth > 1) {
    batchDepth--;
    return;
  }

  let error: unknown;
  let hasError = false;
  reconcileBatchSnapshots();

  while (batchedEffect !== undefined) {
    let effect: Effect | undefined = batchedEffect;
    batchedEffect = undefined;

    batchIteration++;

    while (effect !== undefined) {
      const next: Effect | undefined = effect[K._nextBatchedEffect];
      effect[K._nextBatchedEffect] = undefined;
      effect[K._flags] &= ~NOTIFIED;

      if (!(effect[K._flags] & DISPOSED) && needsToRecompute(effect)) {
        try {
          effect[K._callback]();
        } catch (err) {
          if (!hasError) {
            error = err;
            hasError = true;
          }
        }
      }
      effect = next;
    }
  }
  batchIteration = 0;
  batchDepth--;

  if (hasError) {
    throw error;
  }
}

/**
 * Combine multiple value updates into one "commit" at the end of the provided callback.
 *
 * Batches can be nested and changes are only flushed once the outermost batch callback
 * completes.
 *
 * Accessing a signal that has been modified within a batch will reflect its updated
 * value.
 *
 * @param fn The callback function.
 * @returns The value returned by the callback.
 */
function batch<T>(fn: () => T): T {
  if (batchDepth > 0) {
    return fn();
  }
  currentBatchSnapshotVersion = ++batchSnapshotVersion;
  /*@__INLINE__*/ startBatch();
  try {
    return fn();
  } finally {
    endBatch();
  }
}

// Currently evaluated computed or effect.
let evalContext: Computed | Effect | undefined;

/**
 * Run a callback function that can access signal values without
 * subscribing to the signal updates.
 *
 * @param fn The callback function.
 * @returns The value returned by the callback.
 */
function untracked<T>(fn: () => T): T {
  const prevContext = evalContext;
  evalContext = undefined;
  try {
    return fn();
  } finally {
    evalContext = prevContext;
  }
}

// Effects collected into a batch.
let batchedEffect: Effect | undefined;
let batchDepth = 0;
let batchIteration = 0;

type BatchSnapshot = {
  [K._source]: Signal;
  [K._value]: unknown;
  [K._version]: number;
  [K._next]?: BatchSnapshot | undefined;
};

let batchSnapshotVersion = 0;
let currentBatchSnapshotVersion = 0;
let batchSnapshots: BatchSnapshot | undefined;

// A global version number for signals, used for fast-pathing repeated
// computed[PK.peek]()/computed[PK.value] calls when nothing has changed globally.
let globalVersion = 0;

function recordBatchSnapshot(source: Signal) {
  // Only capture writes during the user-visible batch callback, not during effect flush.
  if (batchDepth === 0 || batchIteration !== 0) {
    return;
  }

  if (source[K._batchSnapshotVersion] !== currentBatchSnapshotVersion) {
    source[K._batchSnapshotVersion] = currentBatchSnapshotVersion;
    batchSnapshots = {
      [K._source]: source,
      [K._value]: source[K._value],
      [K._version]: source[K._version],
      [K._next]: batchSnapshots,
    };
  }
}

function reconcileBatchSnapshots() {
  let snapshots = batchSnapshots;
  batchSnapshots = undefined;

  while (snapshots !== undefined) {
    if (snapshots[K._source][K._value] === snapshots[K._value]) {
      snapshots[K._source][K._version] = snapshots[K._version];
    }
    snapshots = snapshots[K._next];
  }
}

function addDependency(signal: Signal): Node | undefined {
  if (evalContext === undefined) {
    return undefined;
  }

  let node = signal[K._node];
  if (node === undefined || node[K._target] !== evalContext) {
    /**
     * `signal` is a new dependency. Create a new dependency node, and set it
     * as the tail of the current context's dependency list. e.g:
     *
     * { A <-> B       }
     *         ↑     ↑
     *        tail  node (new)
     *               ↓
     * { A <-> B <-> C }
     *               ↑
     *              tail (evalContext[K._sources])
     */
    node = {
      [K._version]: 0,
      [K._source]: signal,
      [K._prevSource]: evalContext[K._sources],
      [K._nextSource]: undefined,
      [K._target]: evalContext,
      [K._prevTarget]: undefined,
      [K._nextTarget]: undefined,
      [K._rollbackNode]: node,
    };

    if (evalContext[K._sources] !== undefined) {
      evalContext[K._sources][K._nextSource] = node;
    }
    evalContext[K._sources] = node;
    signal[K._node] = node;

    // Subscribe to change notifications from this dependency if we're in an effect
    // OR evaluating a computed signal that in turn has subscribers.
    if (evalContext[K._flags] & TRACKING) {
      signal[K._subscribe](node);
    }
    return node;
  } else if (node[K._version] === -1) {
    // `signal` is an existing dependency from a previous evaluation. Reuse it.
    node[K._version] = 0;

    /**
     * If `node` is not already the current tail of the dependency list (i.e.
     * there is a next node in the list), then make the `node` the new tail. e.g:
     *
     * { A <-> B <-> C <-> D }
     *         ↑           ↑
     *        node   ┌─── tail (evalContext[K._sources])
     *         └─────│─────┐
     *               ↓     ↓
     * { A <-> C <-> D <-> B }
     *                     ↑
     *                    tail (evalContext[K._sources])
     */
    if (node[K._nextSource] !== undefined) {
      node[K._nextSource][K._prevSource] = node[K._prevSource];

      if (node[K._prevSource] !== undefined) {
        node[K._prevSource][K._nextSource] = node[K._nextSource];
      }

      node[K._prevSource] = evalContext[K._sources];
      node[K._nextSource] = undefined;

      if (evalContext[K._sources])
        evalContext[K._sources][K._nextSource] = node;
      evalContext[K._sources] = node;
    }

    // We can assume that the currently evaluated effect / computed signal is already
    // subscribed to change notifications from `signal` if needed.
    return node;
  }
  return undefined;
}

//#region Signal

/**
 * The base class for plain and computed signals.
 */
interface Signal<T = unknown> {
  /** @internal */
  [K._value]: unknown;

  /**
   * @internal
   * Version numbers should always be >= 0, because the special value -1 is used
   * by Nodes to signify potentially unused but recyclable nodes.
   */
  [K._version]: number;

  /** @internal */
  [K._node]?: Node | undefined;

  /** @internal */
  [K._targets]?: Node | undefined;

  /** @internal */
  [K._batchSnapshotVersion]: number;

  /** @internal */
  [K._refresh](): boolean;

  /** @internal */
  [K._subscribe](node: Node): void;

  /** @internal */
  [K._unsubscribe](node: Node): void;

  /** @internal */
  [K._watched]?: ((this: Signal<T>) => void) | undefined;

  /** @internal */
  [K._unwatched]?: ((this: Signal<T>) => void) | undefined;

  [PK.subscribe](fn: (value: T) => void): () => void;

  [PK.name]?: string | undefined;

  [PK.peek](): T;

  [PK.brand]: typeof BRAND_SYMBOL;

  valueOf(): T;
  toString(): string;
  toJSON(): T;

  get [PK.value](): T;
  set [PK.value](value: T);
}

export interface SignalOptions<T = unknown> {
  [PK.watched]?: (this: Signal<T>) => void;
  [PK.unwatched]?: (this: Signal<T>) => void;
  [PK.name]?: string | undefined;
}

export interface SignalConstructor {
  new <T>(value?: T, options?: SignalOptions<T>): Signal<T>;
  (this: Signal, value?: unknown, options?: SignalOptions): void;
  prototype: Signal;
}

/** @internal */
const Signal = function (
  this: Signal,
  value?: unknown,
  options?: SignalOptions,
) {
  this[K._value] = value;
  this[K._version] = 0;
  this[K._node] = undefined;
  this[K._targets] = undefined;
  this[K._batchSnapshotVersion] = 0;
  this[K._watched] = options?.[PK.watched];
  this[K._unwatched] = options?.[PK.unwatched];
  this[PK.name] = options?.[PK.name];
} as unknown as SignalConstructor;

Signal.prototype[PK.brand] = BRAND_SYMBOL;

Signal.prototype[K._refresh] = () => true;

Signal.prototype[K._subscribe] = function (node) {
  const targets = this[K._targets];
  if (targets !== node && node[K._prevTarget] === undefined) {
    node[K._nextTarget] = targets;
    this[K._targets] = node;

    if (targets !== undefined) {
      targets[K._prevTarget] = node;
    } else {
      untracked(() => {
        this[K._watched]?.call(this);
      });
    }
  }
};

Signal.prototype[K._unsubscribe] = function (node) {
  // Only run the unsubscribe step if the signal has any subscribers to begin with.
  if (this[K._targets] !== undefined) {
    const prev = node[K._prevTarget];
    const next = node[K._nextTarget];
    if (prev !== undefined) {
      prev[K._nextTarget] = next;
      node[K._prevTarget] = undefined;
    }

    if (next !== undefined) {
      next[K._prevTarget] = prev;
      node[K._nextTarget] = undefined;
    }

    if (node === this[K._targets]) {
      this[K._targets] = next;
      if (next === undefined) {
        untracked(() => {
          this[K._unwatched]?.call(this);
        });
      }
    }
  }
};

Signal.prototype[PK.subscribe] = function (fn) {
  return effect(
    () => {
      const value = this[PK.value];
      const prevContext = evalContext;
      evalContext = undefined;
      try {
        fn(value);
      } finally {
        evalContext = prevContext;
      }
      return undefined;
    },
    { [PK.name]: PK.sub },
  );
};

Signal.prototype[PK.peek] = function () {
  return untracked(() => this[PK.value]);
};

Signal.prototype.valueOf = function () {
  return this[PK.value];
};

Signal.prototype.toString = function () {
  // biome-ignore lint/style/useTemplate: compatibility with original signals-core (+ '' uses valueOf, template literal uses toString)
  return this[PK.value] + '';
};

Signal.prototype.toJSON = function () {
  return this[PK.value];
};

Object.defineProperty(Signal.prototype, PK.value, {
  get(this: Signal) {
    const node = addDependency(this);
    if (node !== undefined) {
      node[K._version] = this[K._version];
    }
    return this[K._value];
  },
  set(this: Signal, value) {
    if (value !== this[K._value]) {
      if (batchIteration > 100) {
        // biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
        throw new Error(PK['Cycle detected']);
      }

      recordBatchSnapshot(this);
      this[K._value] = value;
      this[K._version]++;
      globalVersion++;

      /*@__INLINE__*/ startBatch();
      try {
        for (
          let node = this[K._targets];
          node !== undefined;
          node = node[K._nextTarget]
        ) {
          node[K._target][K._notify]();
        }
      } finally {
        endBatch();
      }
    }
  },
});

/**
 * Create a new plain signal.
 *
 * @param value The initial value for the signal.
 * @returns A new signal.
 */
export function signal<T>(value: T, options?: SignalOptions<T>): Signal<T>;
export function signal<T = undefined>(): Signal<T | undefined>;
export function signal<T>(value?: T, options?: SignalOptions<T>): Signal<T> {
  return new Signal(value, options);
}

//#endregion Signal

//#region Computed

function needsToRecompute(target: Computed | Effect): boolean {
  // Check the dependencies for changed values. The dependency list is already
  // in order of use. Therefore if multiple dependencies have changed values, only
  // the first used dependency is re-evaluated at this point.
  for (
    let node = target[K._sources];
    node !== undefined;
    node = node[K._nextSource]
  ) {
    if (
      // If the dependency has definitely been updated since its version number
      // was observed, then we need to recompute. This first check is not strictly
      // necessary for correctness, but allows us to skip the refresh call if the
      // dependency has already been updated.
      node[K._source][K._version] !== node[K._version] ||
      // Refresh the dependency. If there's something blocking the refresh (e.g. a
      // dependency cycle), then we need to recompute.
      !node[K._source][K._refresh]() ||
      // If the dependency got a new version after the refresh, then we need to recompute.
      node[K._source][K._version] !== node[K._version]
    ) {
      return true;
    }
  }
  // If none of the dependencies have changed values since last recompute then
  // there's no need to recompute.
  return false;
}

function prepareSources(target: Computed | Effect) {
  /**
   * 1. Mark all current sources as re-usable nodes (version: -1)
   * 2. Set a rollback node if the current node is being used in a different context
   * 3. Point 'target[K._sources]' to the tail of the doubly-linked list, e.g:
   *
   *    { undefined <- A <-> B <-> C -> undefined }
   *                   ↑           ↑
   *                   │           └──────────┐
   * target[K._sources] = A; (node is head)   │
   *                   ↓                      │
   * target[K._sources] = C; (node is tail) ──┘
   */
  for (
    let node = target[K._sources];
    node !== undefined;
    node = node[K._nextSource]
  ) {
    const rollbackNode = node[K._source][K._node];
    if (rollbackNode !== undefined) {
      node[K._rollbackNode] = rollbackNode;
    }
    node[K._source][K._node] = node;
    node[K._version] = -1;

    if (node[K._nextSource] === undefined) {
      target[K._sources] = node;
      break;
    }
  }
}

function cleanupSources(target: Computed | Effect) {
  let node = target[K._sources];
  let head: Node | undefined;

  /**
   * At this point 'target[K._sources]' points to the tail of the doubly-linked list.
   * It contains all existing sources + new sources in order of use.
   * Iterate backwards until we find the head node while dropping old dependencies.
   */
  while (node !== undefined) {
    const prev = node[K._prevSource];

    /**
     * The node was not re-used, unsubscribe from its change notifications and remove itself
     * from the doubly-linked list. e.g:
     *
     * { A <-> B <-> C }
     *         ↓
     *    { A <-> C }
     */
    if (node[K._version] === -1) {
      node[K._source][K._unsubscribe](node);

      if (prev !== undefined) {
        prev[K._nextSource] = node[K._nextSource];
      }
      if (node[K._nextSource] !== undefined) {
        node[K._nextSource][K._prevSource] = prev;
      }
    } else {
      /**
       * The new head is the last node seen which wasn't removed/unsubscribed
       * from the doubly-linked list. e.g:
       *
       * { A <-> B <-> C }
       *   ↑     ↑     ↑
       *   │     │     └ head = node
       *   │     └ head = node
       *   └ head = node
       */
      head = node;
    }

    node[K._source][K._node] = node[K._rollbackNode];
    if (node[K._rollbackNode] !== undefined) {
      node[K._rollbackNode] = undefined;
    }

    node = prev;
  }

  target[K._sources] = head;
}

/**
 * The base class for computed signals.
 */
interface Computed<T = unknown> extends Signal<T> {
  [K._fn]: () => T;
  [K._sources]?: Node | undefined;
  [K._globalVersion]: number;
  [K._flags]: number;

  [K._notify](): void;
  get [PK.value](): T;
}

export interface ComputedConstructor {
  new <T>(fn: () => T, options?: SignalOptions<T>): Computed<T>;
  (this: Computed, fn: () => unknown, options?: SignalOptions): void;
  prototype: Computed;
}

/** @internal */
const Computed = function (
  this: Computed,
  fn: () => unknown,
  options?: SignalOptions,
) {
  Signal.call(this, undefined);
  this[K._fn] = fn;
  this[K._sources] = undefined;
  this[K._globalVersion] = globalVersion - 1;
  this[K._flags] = OUTDATED;
  this[K._watched] = options?.[PK.watched];
  this[K._unwatched] = options?.[PK.unwatched];
  this[PK.name] = options?.[PK.name];
} as unknown as ComputedConstructor;

(Computed as unknown as { prototype: Computed }).prototype =
  new Signal() as Computed;

Computed.prototype[K._refresh] = function () {
  this[K._flags] &= ~NOTIFIED;

  if (this[K._flags] & RUNNING) {
    return false;
  }

  // If this computed signal has subscribed to updates from its dependencies
  // (TRACKING flag set) and none of them have notified about changes (OUTDATED
  // flag not set), then the computed value can't have changed.
  if ((this[K._flags] & (OUTDATED | TRACKING)) === TRACKING) {
    return true;
  }
  this[K._flags] &= ~OUTDATED;

  if (this[K._globalVersion] === globalVersion) {
    return true;
  }
  this[K._globalVersion] = globalVersion;

  // Mark this computed signal running before checking the dependencies for value
  // changes, so that the RUNNING flag can be used to notice cyclical dependencies.
  this[K._flags] |= RUNNING;
  if (this[K._version] > 0 && !needsToRecompute(this)) {
    this[K._flags] &= ~RUNNING;
    return true;
  }

  const prevContext = evalContext;
  try {
    prepareSources(this);
    evalContext = this;
    const value = this[K._fn]();
    if (
      this[K._flags] & HAS_ERROR ||
      this[K._value] !== value ||
      this[K._version] === 0
    ) {
      this[K._value] = value;
      this[K._flags] &= ~HAS_ERROR;
      this[K._version]++;
    }
  } catch (err) {
    this[K._value] = err;
    this[K._flags] |= HAS_ERROR;
    this[K._version]++;
  }
  evalContext = prevContext;
  cleanupSources(this);
  this[K._flags] &= ~RUNNING;
  return true;
};

Computed.prototype[K._subscribe] = function (node) {
  if (this[K._targets] === undefined) {
    this[K._flags] |= OUTDATED | TRACKING;

    // A computed signal subscribes lazily to its dependencies when it
    // gets its first subscriber.
    for (
      let node = this[K._sources];
      node !== undefined;
      node = node[K._nextSource]
    ) {
      node[K._source][K._subscribe](node);
    }
  }
  Signal.prototype[K._subscribe].call(this, node);
};

Computed.prototype[K._unsubscribe] = function (node) {
  // Only run the unsubscribe step if the computed signal has any subscribers.
  if (this[K._targets] !== undefined) {
    Signal.prototype[K._unsubscribe].call(this, node);

    // Computed signal unsubscribes from its dependencies when it loses its last subscriber.
    // This makes it possible for unreferences subgraphs of computed signals to get garbage collected.
    if (this[K._targets] === undefined) {
      this[K._flags] &= ~TRACKING;

      for (
        let node = this[K._sources];
        node !== undefined;
        node = node[K._nextSource]
      ) {
        node[K._source][K._unsubscribe](node);
      }
    }
  }
};

Computed.prototype[K._notify] = function () {
  if (!(this[K._flags] & NOTIFIED)) {
    this[K._flags] |= OUTDATED | NOTIFIED;

    for (
      let node = this[K._targets];
      node !== undefined;
      node = node[K._nextTarget]
    ) {
      node[K._target][K._notify]();
    }
  }
};

Object.defineProperty(Computed.prototype, PK.value, {
  get(this: Computed) {
    if (this[K._flags] & RUNNING) {
      // biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
      throw new Error(PK['Cycle detected']);
    }
    const node = addDependency(this);
    this[K._refresh]();
    if (node !== undefined) {
      node[K._version] = this[K._version];
    }
    if (this[K._flags] & HAS_ERROR) {
      throw this[K._value];
    }
    return this[K._value];
  },
});

/**
 * An interface for read-only signals.
 */
interface ReadonlySignal<T = unknown> {
  readonly [PK.value]: T;
  [PK.peek](): T;

  [PK.subscribe](fn: (value: T) => void): () => void;
  valueOf(): T;
  toString(): string;
  toJSON(): T;
  [PK.brand]: typeof BRAND_SYMBOL;
}

/**
 * Create a new signal that is computed based on the values of other signals.
 *
 * The returned computed signal is read-only, and its value is automatically
 * updated when any signals accessed from within the callback function change.
 *
 * @param fn The effect callback.
 * @returns A new read-only signal.
 */
function computed<T>(
  fn: () => T,
  options?: SignalOptions<T>,
): ReadonlySignal<T> {
  return new Computed(fn, options);
}

//#endregion Computed

//#region Effect

function cleanupEffect(effect: Effect) {
  const cleanup = effect[K._cleanup];
  effect[K._cleanup] = undefined;

  if (typeof cleanup === 'function') {
    /*@__INLINE__*/ startBatch();

    // Run cleanup functions always outside of any context.
    const prevContext = evalContext;
    evalContext = undefined;
    try {
      cleanup();
    } catch (err) {
      effect[K._flags] &= ~RUNNING;
      effect[K._flags] |= DISPOSED;
      disposeEffect(effect);
      throw err;
    } finally {
      evalContext = prevContext;
      endBatch();
    }
  }
}

function disposeEffect(effect: Effect) {
  for (
    let node = effect[K._sources];
    node !== undefined;
    node = node[K._nextSource]
  ) {
    node[K._source][K._unsubscribe](node);
  }
  effect[K._fn] = undefined;
  effect[K._sources] = undefined;

  cleanupEffect(effect);
}

function endEffect(this: Effect, prevContext?: Computed | Effect) {
  if (evalContext !== this) {
    // biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
    throw new Error(PK['Out-of-order effect']);
  }
  cleanupSources(this);
  evalContext = prevContext;

  this[K._flags] &= ~RUNNING;
  if (this[K._flags] & DISPOSED) {
    disposeEffect(this);
  }
  endBatch();
}

export type EffectFn =
  // biome-ignore lint/suspicious/noConfusingVoidType: compatibility with original signals-core
  | ((this: { [PK.dispose]: () => void }) => void | (() => void))
  // biome-ignore lint/suspicious/noConfusingVoidType: compatibility with original signals-core
  | (() => void | (() => void));

// Avoid hard-requiring the ESNext.Disposable lib in consuming tsconfigs.
// When `Symbol.dispose` is available, this becomes a symbol-keyed disposer type.
type DisposeSymbol = typeof Symbol extends { readonly dispose: infer TDispose }
  ? TDispose
  : never;
type DisposableLike = {
  [_K in DisposeSymbol & PropertyKey]: () => void;
};
type DisposeFn = (() => void) & DisposableLike;

/**
 * The base class for reactive effects.
 */
interface Effect {
  [K._fn]?: EffectFn | undefined;
  [K._cleanup]?: (() => void) | undefined;
  [K._sources]?: Node | undefined;
  [K._nextBatchedEffect]?: Effect | undefined;
  [K._flags]: number;
  [K._debugCallback]?: (() => void) | undefined;
  [PK.name]?: string | undefined;

  [K._callback](): void;
  [K._start](): () => void;
  [K._notify](): void;
  [K._dispose](): void;
  [PK.dispose](): void;
}

export interface EffectConstructor {
  new (fn: EffectFn, options?: EffectOptions): Effect;
  (this: Effect, fn: EffectFn, options?: EffectOptions): void;
  prototype: Effect;
}

export interface EffectOptions {
  [PK.name]?: string | undefined;
}

let capturedEffects: Effect[] | undefined;

/** @internal */
const Effect = function (this: Effect, fn: EffectFn, options?: EffectOptions) {
  this[K._fn] = fn;
  this[K._cleanup] = undefined;
  this[K._sources] = undefined;
  this[K._nextBatchedEffect] = undefined;
  this[K._flags] = TRACKING;
  this[PK.name] = options?.[PK.name];
  if (capturedEffects) {
    capturedEffects.push(this);
  }
} as unknown as EffectConstructor;

Effect.prototype[K._callback] = function () {
  const finish = this[K._start]();
  try {
    if (this[K._flags] & DISPOSED) return;
    if (this[K._fn] === undefined) return;

    const cleanup = this[K._fn]();
    if (typeof cleanup === 'function') {
      this[K._cleanup] = cleanup;
    }
  } finally {
    finish();
  }
};

Effect.prototype[K._start] = function () {
  if (this[K._flags] & RUNNING) {
    // biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
    throw new Error(PK['Cycle detected']);
  }
  this[K._flags] |= RUNNING;
  this[K._flags] &= ~DISPOSED;
  cleanupEffect(this);
  prepareSources(this);

  /*@__INLINE__*/ startBatch();
  const prevContext = evalContext;
  evalContext = this;
  return endEffect.bind(this, prevContext);
};

Effect.prototype[K._notify] = function () {
  if (!(this[K._flags] & NOTIFIED)) {
    this[K._flags] |= NOTIFIED;
    this[K._nextBatchedEffect] = batchedEffect;
    batchedEffect = this;
  }
};

Effect.prototype[K._dispose] = function () {
  this[K._flags] |= DISPOSED;

  if (!(this[K._flags] & RUNNING)) {
    disposeEffect(this);
  }
};

Effect.prototype[PK.dispose] = function () {
  this[K._dispose]();
};
/**
 * Create an effect to run arbitrary code in response to signal changes.
 *
 * An effect tracks which signals are accessed within the given callback
 * function `fn`, and re-runs the callback when those signals change.
 *
 * The callback may return a cleanup function. The cleanup function gets
 * run once, either when the callback is next called or when the effect
 * gets disposed, whichever happens first.
 *
 * @param fn The effect callback.
 * @returns A function for disposing the effect.
 */
function effect(fn: EffectFn, options?: EffectOptions): DisposeFn {
  const effect = new Effect(fn, options);
  try {
    effect[K._callback]();
  } catch (err) {
    effect[K._dispose]();
    throw err;
  }
  // Return a bound function instead of a wrapper like `() => effect[K._dispose]()`,
  // because bound functions seem to be just as fast and take up a lot less memory.
  const dispose = effect[K._dispose].bind(effect);
  Object.assign(dispose, { [Symbol.dispose]: dispose });
  return dispose as DisposeFn;
}

//#endregion Effect

//#region Action

function action<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  return function actionWrapper(this: unknown, ...args: TArgs) {
    return batch(() => untracked(() => fn.apply(this, args)));
  };
}

//#endregion Action

//#region createModel

/** Models should only contain signals, actions, and nested objects containing only signals and actions. */
type ValidateModel<TModel> = {
  [Key in keyof TModel]: TModel[Key] extends ReadonlySignal<unknown>
    ? TModel[Key]
    : TModel[Key] extends (...args: never[]) => unknown
      ? TModel[Key]
      : TModel[Key] extends object
        ? ValidateModel<TModel[Key]>
        : `Property ${Key extends string ? `'${Key}' ` : ''}is not a Signal, Action, or an object that contains only Signals and Actions.`;
};

export type Model<TModel> = ValidateModel<TModel> & DisposableLike;

export type ModelFactory<TModel, TFactoryArgs extends unknown[] = []> = (
  ...args: TFactoryArgs
) => ValidateModel<TModel>;
export type ModelConstructor<
  TModel,
  TFactoryArgs extends unknown[] = [],
> = new (...args: TFactoryArgs) => Model<TModel>;

/**
 * The public types for ModelConstructor require using `new` to help
 * disambiguate the function passed into `createModel` and the returned
 * constructor function. It is easier to say that `createModel` accepts
 * a factory and returns a class, then to say it accepts a factory and
 * returns a factory. In other words, this example:
 *
 * ```ts
 * const PersonModel = createModel((name: string) => ({ ... }));
 * const person = new PersonModel("John");
 * ```
 *
 * is easier to understand than this example:
 *
 * ```ts
 * const createPerson = createModel((name: string) => ({ ... }));
 * const person = createPerson("John");
 * ```
 *
 * However, internally we implement `createModel` to return a function
 * that can be called without `new` for simplicity. To bridge the gap
 * between the public types and the internal implementation, we define
 * this internal interface that extends the public interface but also
 * allows calling without `new`.
 *
 * This pattern is used by the Preact & React adapters to make instantiating
 * a model or a function that returns a model easier.
 *
 * @internal
 */
interface InternalModelConstructor<TModel, TFactoryArgs extends unknown[]>
  extends ModelConstructor<TModel, TFactoryArgs> {
  (...args: TFactoryArgs): Model<TModel>;
}

function startCapturingEffects(): () => Effect[] | undefined {
  let prevCapturedEffects = capturedEffects;
  capturedEffects = [];

  return function stopCapturingEffects() {
    const modelEffects = capturedEffects;
    if (capturedEffects && prevCapturedEffects) {
      prevCapturedEffects = prevCapturedEffects.concat(capturedEffects);
    }

    capturedEffects = prevCapturedEffects;

    return modelEffects;
  };
}

const wrapInAction = (value: Record<string | symbol, unknown>) => {
  const keys = Reflect.ownKeys(value);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const val = value[key];
    if (typeof val === 'function') {
      value[key] = action(val as (...args: unknown[]) => unknown);
    } else if (typeof val === 'object' && val !== null) {
      if (!(PK.brand in val)) {
        // Recursively wrap nested object properties in actions. This allows users to write
        // nested models without worrying about wrapping their functions in `action`.
        wrapInAction(val as Record<PropertyKey, unknown>);
      }
    }
  }
};

function createModel<TModel, TFactoryArgs extends unknown[] = []>(
  modelFactory: ModelFactory<TModel, TFactoryArgs>,
): ModelConstructor<TModel, TFactoryArgs> {
  return function SignalModel(...args: TFactoryArgs): Model<TModel> {
    let modelEffects: Effect[] | undefined;
    let model: Model<TModel>;

    const stopCapturingEffects = startCapturingEffects();
    try {
      model = modelFactory(...args) as Model<TModel>;
    } catch (err) {
      // Drop any captured effects on error. Errors from nested models will bubble
      // up here and recursively reset `capturedEffects` to `undefined` preventing
      // any captured effects from leaking
      capturedEffects = undefined;
      throw err;
    } finally {
      modelEffects = stopCapturingEffects();
    }

    wrapInAction(model as unknown as Record<string | symbol, unknown>);

    model[Symbol.dispose] = action(function disposeModel() {
      const effects = modelEffects;
      if (effects) {
        for (let i = 0; i < effects.length; i++) {
          effects[i]?.[PK.dispose]();
        }
      }

      modelEffects = undefined;
    });

    return model;
  } as InternalModelConstructor<TModel, TFactoryArgs>;
}

//#endregion createModel

export {
  action,
  batch,
  Computed,
  computed,
  createModel,
  Effect,
  effect,
  type ReadonlySignal,
  Signal,
  untracked,
};
