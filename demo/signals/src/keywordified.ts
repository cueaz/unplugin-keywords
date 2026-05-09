/**
 * @license
 * Copyright 2026 cueaz (Modifications)
 * Copyright 2022-present Preact Team (Original Work)
 *
 * This file has been modified from its original version.
 * SPDX-License-Identifier: MIT
 */

import * as K from 'virtual:keywords';
import * as L from 'virtual:keywords/local';

// An named symbol/brand for detecting Signal instances even when they weren't
// created using the same signals library version.
// biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
const BRAND_SYMBOL = Symbol.for(K['preact-signals']);

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
  [L._source]: Signal;
  [L._prevSource]?: Node | undefined;
  [L._nextSource]?: Node | undefined;

  // A target that depends on the source and should be notified when the source changes.
  [L._target]: Computed | Effect;
  [L._prevTarget]?: Node | undefined;
  [L._nextTarget]?: Node | undefined;

  // The version number of the source that target has last seen. We use version numbers
  // instead of storing the source value, because source values can take arbitrary amount
  // of memory, and computeds could hang on to them forever because they're lazily evaluated.
  // Use the special value -1 to mark potentially unused but recyclable nodes.
  [L._version]: number;

  // Used to remember & roll back the source's previous `[L._node]` value when entering &
  // exiting a new evaluation context.
  [L._rollbackNode]?: Node | undefined;
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
      const next: Effect | undefined = effect[L._nextBatchedEffect];
      effect[L._nextBatchedEffect] = undefined;
      effect[L._flags] &= ~NOTIFIED;

      if (!(effect[L._flags] & DISPOSED) && needsToRecompute(effect)) {
        try {
          effect[L._callback]();
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
  [L._source]: Signal;
  [L._value]: unknown;
  [L._version]: number;
  [L._next]?: BatchSnapshot | undefined;
};

let batchSnapshotVersion = 0;
let currentBatchSnapshotVersion = 0;
let batchSnapshots: BatchSnapshot | undefined;

// A global version number for signals, used for fast-pathing repeated
// computed[K.peek]()/computed[K.value] calls when nothing has changed globally.
let globalVersion = 0;

function recordBatchSnapshot(source: Signal) {
  // Only capture writes during the user-visible batch callback, not during effect flush.
  if (batchDepth === 0 || batchIteration !== 0) {
    return;
  }

  if (source[L._batchSnapshotVersion] !== currentBatchSnapshotVersion) {
    source[L._batchSnapshotVersion] = currentBatchSnapshotVersion;
    batchSnapshots = {
      [L._source]: source,
      [L._value]: source[L._value],
      [L._version]: source[L._version],
      [L._next]: batchSnapshots,
    };
  }
}

function reconcileBatchSnapshots() {
  let snapshots = batchSnapshots;
  batchSnapshots = undefined;

  while (snapshots !== undefined) {
    if (snapshots[L._source][L._value] === snapshots[L._value]) {
      snapshots[L._source][L._version] = snapshots[L._version];
    }
    snapshots = snapshots[L._next];
  }
}

function addDependency(signal: Signal): Node | undefined {
  if (evalContext === undefined) {
    return undefined;
  }

  let node = signal[L._node];
  if (node === undefined || node[L._target] !== evalContext) {
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
     *              tail (evalContext[L._sources])
     */
    node = {
      [L._version]: 0,
      [L._source]: signal,
      [L._prevSource]: evalContext[L._sources],
      [L._nextSource]: undefined,
      [L._target]: evalContext,
      [L._prevTarget]: undefined,
      [L._nextTarget]: undefined,
      [L._rollbackNode]: node,
    };

    if (evalContext[L._sources] !== undefined) {
      evalContext[L._sources][L._nextSource] = node;
    }
    evalContext[L._sources] = node;
    signal[L._node] = node;

    // Subscribe to change notifications from this dependency if we're in an effect
    // OR evaluating a computed signal that in turn has subscribers.
    if (evalContext[L._flags] & TRACKING) {
      signal[L._subscribe](node);
    }
    return node;
  } else if (node[L._version] === -1) {
    // `signal` is an existing dependency from a previous evaluation. Reuse it.
    node[L._version] = 0;

    /**
     * If `node` is not already the current tail of the dependency list (i.e.
     * there is a next node in the list), then make the `node` the new tail. e.g:
     *
     * { A <-> B <-> C <-> D }
     *         ↑           ↑
     *        node   ┌─── tail (evalContext[L._sources])
     *         └─────│─────┐
     *               ↓     ↓
     * { A <-> C <-> D <-> B }
     *                     ↑
     *                    tail (evalContext[L._sources])
     */
    if (node[L._nextSource] !== undefined) {
      node[L._nextSource][L._prevSource] = node[L._prevSource];

      if (node[L._prevSource] !== undefined) {
        node[L._prevSource][L._nextSource] = node[L._nextSource];
      }

      node[L._prevSource] = evalContext[L._sources];
      node[L._nextSource] = undefined;

      if (evalContext[L._sources])
        evalContext[L._sources][L._nextSource] = node;
      evalContext[L._sources] = node;
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
  [L._value]: unknown;

  /**
   * @internal
   * Version numbers should always be >= 0, because the special value -1 is used
   * by Nodes to signify potentially unused but recyclable nodes.
   */
  [L._version]: number;

  /** @internal */
  [L._node]?: Node | undefined;

  /** @internal */
  [L._targets]?: Node | undefined;

  /** @internal */
  [L._batchSnapshotVersion]: number;

  /** @internal */
  [L._refresh](): boolean;

  /** @internal */
  [L._subscribe](node: Node): void;

  /** @internal */
  [L._unsubscribe](node: Node): void;

  /** @internal */
  [L._watched]?: ((this: Signal<T>) => void) | undefined;

  /** @internal */
  [L._unwatched]?: ((this: Signal<T>) => void) | undefined;

  [K.subscribe](fn: (value: T) => void): () => void;

  [K.name]?: string | undefined;

  [K.peek](): T;

  [K.brand]: typeof BRAND_SYMBOL;

  valueOf(): T;
  toString(): string;
  toJSON(): T;

  get [K.value](): T;
  set [K.value](value: T);
}

export interface SignalOptions<T = unknown> {
  [K.watched]?: (this: Signal<T>) => void;
  [K.unwatched]?: (this: Signal<T>) => void;
  [K.name]?: string | undefined;
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
  this[L._value] = value;
  this[L._version] = 0;
  this[L._node] = undefined;
  this[L._targets] = undefined;
  this[L._batchSnapshotVersion] = 0;
  this[L._watched] = options?.[K.watched];
  this[L._unwatched] = options?.[K.unwatched];
  this[K.name] = options?.[K.name];
} as unknown as SignalConstructor;

Signal.prototype[K.brand] = BRAND_SYMBOL;

Signal.prototype[L._refresh] = () => true;

Signal.prototype[L._subscribe] = function (node) {
  const targets = this[L._targets];
  if (targets !== node && node[L._prevTarget] === undefined) {
    node[L._nextTarget] = targets;
    this[L._targets] = node;

    if (targets !== undefined) {
      targets[L._prevTarget] = node;
    } else {
      untracked(() => {
        this[L._watched]?.call(this);
      });
    }
  }
};

Signal.prototype[L._unsubscribe] = function (node) {
  // Only run the unsubscribe step if the signal has any subscribers to begin with.
  if (this[L._targets] !== undefined) {
    const prev = node[L._prevTarget];
    const next = node[L._nextTarget];
    if (prev !== undefined) {
      prev[L._nextTarget] = next;
      node[L._prevTarget] = undefined;
    }

    if (next !== undefined) {
      next[L._prevTarget] = prev;
      node[L._nextTarget] = undefined;
    }

    if (node === this[L._targets]) {
      this[L._targets] = next;
      if (next === undefined) {
        untracked(() => {
          this[L._unwatched]?.call(this);
        });
      }
    }
  }
};

Signal.prototype[K.subscribe] = function (fn) {
  return effect(
    () => {
      const value = this[K.value];
      const prevContext = evalContext;
      evalContext = undefined;
      try {
        fn(value);
      } finally {
        evalContext = prevContext;
      }
      return undefined;
    },
    { [K.name]: K.sub },
  );
};

Signal.prototype[K.peek] = function () {
  return untracked(() => this[K.value]);
};

Signal.prototype.valueOf = function () {
  return this[K.value];
};

Signal.prototype.toString = function () {
  // biome-ignore lint/style/useTemplate: compatibility with original signals-core (+ '' uses valueOf, template literal uses toString)
  return this[K.value] + '';
};

Signal.prototype.toJSON = function () {
  return this[K.value];
};

Object.defineProperty(Signal.prototype, K.value, {
  get(this: Signal) {
    const node = addDependency(this);
    if (node !== undefined) {
      node[L._version] = this[L._version];
    }
    return this[L._value];
  },
  set(this: Signal, value) {
    if (value !== this[L._value]) {
      if (batchIteration > 100) {
        // biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
        throw new Error(K['Cycle detected']);
      }

      recordBatchSnapshot(this);
      this[L._value] = value;
      this[L._version]++;
      globalVersion++;

      /*@__INLINE__*/ startBatch();
      try {
        for (
          let node = this[L._targets];
          node !== undefined;
          node = node[L._nextTarget]
        ) {
          node[L._target][L._notify]();
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
    let node = target[L._sources];
    node !== undefined;
    node = node[L._nextSource]
  ) {
    if (
      // If the dependency has definitely been updated since its version number
      // was observed, then we need to recompute. This first check is not strictly
      // necessary for correctness, but allows us to skip the refresh call if the
      // dependency has already been updated.
      node[L._source][L._version] !== node[L._version] ||
      // Refresh the dependency. If there's something blocking the refresh (e.g. a
      // dependency cycle), then we need to recompute.
      !node[L._source][L._refresh]() ||
      // If the dependency got a new version after the refresh, then we need to recompute.
      node[L._source][L._version] !== node[L._version]
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
   * 3. Point 'target[L._sources]' to the tail of the doubly-linked list, e.g:
   *
   *    { undefined <- A <-> B <-> C -> undefined }
   *                   ↑           ↑
   *                   │           └──────────┐
   * target[L._sources] = A; (node is head)   │
   *                   ↓                      │
   * target[L._sources] = C; (node is tail) ──┘
   */
  for (
    let node = target[L._sources];
    node !== undefined;
    node = node[L._nextSource]
  ) {
    const rollbackNode = node[L._source][L._node];
    if (rollbackNode !== undefined) {
      node[L._rollbackNode] = rollbackNode;
    }
    node[L._source][L._node] = node;
    node[L._version] = -1;

    if (node[L._nextSource] === undefined) {
      target[L._sources] = node;
      break;
    }
  }
}

function cleanupSources(target: Computed | Effect) {
  let node = target[L._sources];
  let head: Node | undefined;

  /**
   * At this point 'target[L._sources]' points to the tail of the doubly-linked list.
   * It contains all existing sources + new sources in order of use.
   * Iterate backwards until we find the head node while dropping old dependencies.
   */
  while (node !== undefined) {
    const prev = node[L._prevSource];

    /**
     * The node was not re-used, unsubscribe from its change notifications and remove itself
     * from the doubly-linked list. e.g:
     *
     * { A <-> B <-> C }
     *         ↓
     *    { A <-> C }
     */
    if (node[L._version] === -1) {
      node[L._source][L._unsubscribe](node);

      if (prev !== undefined) {
        prev[L._nextSource] = node[L._nextSource];
      }
      if (node[L._nextSource] !== undefined) {
        node[L._nextSource][L._prevSource] = prev;
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

    node[L._source][L._node] = node[L._rollbackNode];
    if (node[L._rollbackNode] !== undefined) {
      node[L._rollbackNode] = undefined;
    }

    node = prev;
  }

  target[L._sources] = head;
}

/**
 * The base class for computed signals.
 */
interface Computed<T = unknown> extends Signal<T> {
  [L._fn]: () => T;
  [L._sources]?: Node | undefined;
  [L._globalVersion]: number;
  [L._flags]: number;

  [L._notify](): void;
  get [K.value](): T;
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
  this[L._fn] = fn;
  this[L._sources] = undefined;
  this[L._globalVersion] = globalVersion - 1;
  this[L._flags] = OUTDATED;
  this[L._watched] = options?.[K.watched];
  this[L._unwatched] = options?.[K.unwatched];
  this[K.name] = options?.[K.name];
} as unknown as ComputedConstructor;

(Computed as unknown as { prototype: Computed }).prototype =
  new Signal() as Computed;

Computed.prototype[L._refresh] = function () {
  this[L._flags] &= ~NOTIFIED;

  if (this[L._flags] & RUNNING) {
    return false;
  }

  // If this computed signal has subscribed to updates from its dependencies
  // (TRACKING flag set) and none of them have notified about changes (OUTDATED
  // flag not set), then the computed value can't have changed.
  if ((this[L._flags] & (OUTDATED | TRACKING)) === TRACKING) {
    return true;
  }
  this[L._flags] &= ~OUTDATED;

  if (this[L._globalVersion] === globalVersion) {
    return true;
  }
  this[L._globalVersion] = globalVersion;

  // Mark this computed signal running before checking the dependencies for value
  // changes, so that the RUNNING flag can be used to notice cyclical dependencies.
  this[L._flags] |= RUNNING;
  if (this[L._version] > 0 && !needsToRecompute(this)) {
    this[L._flags] &= ~RUNNING;
    return true;
  }

  const prevContext = evalContext;
  try {
    prepareSources(this);
    evalContext = this;
    const value = this[L._fn]();
    if (
      this[L._flags] & HAS_ERROR ||
      this[L._value] !== value ||
      this[L._version] === 0
    ) {
      this[L._value] = value;
      this[L._flags] &= ~HAS_ERROR;
      this[L._version]++;
    }
  } catch (err) {
    this[L._value] = err;
    this[L._flags] |= HAS_ERROR;
    this[L._version]++;
  }
  evalContext = prevContext;
  cleanupSources(this);
  this[L._flags] &= ~RUNNING;
  return true;
};

Computed.prototype[L._subscribe] = function (node) {
  if (this[L._targets] === undefined) {
    this[L._flags] |= OUTDATED | TRACKING;

    // A computed signal subscribes lazily to its dependencies when it
    // gets its first subscriber.
    for (
      let node = this[L._sources];
      node !== undefined;
      node = node[L._nextSource]
    ) {
      node[L._source][L._subscribe](node);
    }
  }
  Signal.prototype[L._subscribe].call(this, node);
};

Computed.prototype[L._unsubscribe] = function (node) {
  // Only run the unsubscribe step if the computed signal has any subscribers.
  if (this[L._targets] !== undefined) {
    Signal.prototype[L._unsubscribe].call(this, node);

    // Computed signal unsubscribes from its dependencies when it loses its last subscriber.
    // This makes it possible for unreferences subgraphs of computed signals to get garbage collected.
    if (this[L._targets] === undefined) {
      this[L._flags] &= ~TRACKING;

      for (
        let node = this[L._sources];
        node !== undefined;
        node = node[L._nextSource]
      ) {
        node[L._source][L._unsubscribe](node);
      }
    }
  }
};

Computed.prototype[L._notify] = function () {
  if (!(this[L._flags] & NOTIFIED)) {
    this[L._flags] |= OUTDATED | NOTIFIED;

    for (
      let node = this[L._targets];
      node !== undefined;
      node = node[L._nextTarget]
    ) {
      node[L._target][L._notify]();
    }
  }
};

Object.defineProperty(Computed.prototype, K.value, {
  get(this: Computed) {
    if (this[L._flags] & RUNNING) {
      // biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
      throw new Error(K['Cycle detected']);
    }
    const node = addDependency(this);
    this[L._refresh]();
    if (node !== undefined) {
      node[L._version] = this[L._version];
    }
    if (this[L._flags] & HAS_ERROR) {
      throw this[L._value];
    }
    return this[L._value];
  },
});

/**
 * An interface for read-only signals.
 */
interface ReadonlySignal<T = unknown> {
  readonly [K.value]: T;
  [K.peek](): T;

  [K.subscribe](fn: (value: T) => void): () => void;
  valueOf(): T;
  toString(): string;
  toJSON(): T;
  [K.brand]: typeof BRAND_SYMBOL;
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
  const cleanup = effect[L._cleanup];
  effect[L._cleanup] = undefined;

  if (typeof cleanup === 'function') {
    /*@__INLINE__*/ startBatch();

    // Run cleanup functions always outside of any context.
    const prevContext = evalContext;
    evalContext = undefined;
    try {
      cleanup();
    } catch (err) {
      effect[L._flags] &= ~RUNNING;
      effect[L._flags] |= DISPOSED;
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
    let node = effect[L._sources];
    node !== undefined;
    node = node[L._nextSource]
  ) {
    node[L._source][L._unsubscribe](node);
  }
  effect[L._fn] = undefined;
  effect[L._sources] = undefined;

  cleanupEffect(effect);
}

function endEffect(this: Effect, prevContext?: Computed | Effect) {
  if (evalContext !== this) {
    // biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
    throw new Error(K['Out-of-order effect']);
  }
  cleanupSources(this);
  evalContext = prevContext;

  this[L._flags] &= ~RUNNING;
  if (this[L._flags] & DISPOSED) {
    disposeEffect(this);
  }
  endBatch();
}

export type EffectFn =
  // biome-ignore lint/suspicious/noConfusingVoidType: compatibility with original signals-core
  | ((this: { [K.dispose]: () => void }) => void | (() => void))
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
  [L._fn]?: EffectFn | undefined;
  [L._cleanup]?: (() => void) | undefined;
  [L._sources]?: Node | undefined;
  [L._nextBatchedEffect]?: Effect | undefined;
  [L._flags]: number;
  [L._debugCallback]?: (() => void) | undefined;
  [K.name]?: string | undefined;

  [L._callback](): void;
  [L._start](): () => void;
  [L._notify](): void;
  [L._dispose](): void;
  [K.dispose](): void;
}

export interface EffectConstructor {
  new (fn: EffectFn, options?: EffectOptions): Effect;
  (this: Effect, fn: EffectFn, options?: EffectOptions): void;
  prototype: Effect;
}

export interface EffectOptions {
  [K.name]?: string | undefined;
}

let capturedEffects: Effect[] | undefined;

/** @internal */
const Effect = function (this: Effect, fn: EffectFn, options?: EffectOptions) {
  this[L._fn] = fn;
  this[L._cleanup] = undefined;
  this[L._sources] = undefined;
  this[L._nextBatchedEffect] = undefined;
  this[L._flags] = TRACKING;
  this[K.name] = options?.[K.name];
  if (capturedEffects) {
    capturedEffects.push(this);
  }
} as unknown as EffectConstructor;

Effect.prototype[L._callback] = function () {
  const finish = this[L._start]();
  try {
    if (this[L._flags] & DISPOSED) return;
    if (this[L._fn] === undefined) return;

    const cleanup = this[L._fn]();
    if (typeof cleanup === 'function') {
      this[L._cleanup] = cleanup;
    }
  } finally {
    finish();
  }
};

Effect.prototype[L._start] = function () {
  if (this[L._flags] & RUNNING) {
    // biome-ignore lint/performance/noDynamicNamespaceImportAccess: tree-shakable
    throw new Error(K['Cycle detected']);
  }
  this[L._flags] |= RUNNING;
  this[L._flags] &= ~DISPOSED;
  cleanupEffect(this);
  prepareSources(this);

  /*@__INLINE__*/ startBatch();
  const prevContext = evalContext;
  evalContext = this;
  return endEffect.bind(this, prevContext);
};

Effect.prototype[L._notify] = function () {
  if (!(this[L._flags] & NOTIFIED)) {
    this[L._flags] |= NOTIFIED;
    this[L._nextBatchedEffect] = batchedEffect;
    batchedEffect = this;
  }
};

Effect.prototype[L._dispose] = function () {
  this[L._flags] |= DISPOSED;

  if (!(this[L._flags] & RUNNING)) {
    disposeEffect(this);
  }
};

Effect.prototype[K.dispose] = function () {
  this[L._dispose]();
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
    effect[L._callback]();
  } catch (err) {
    effect[L._dispose]();
    throw err;
  }
  // Return a bound function instead of a wrapper like `() => effect[L._dispose]()`,
  // because bound functions seem to be just as fast and take up a lot less memory.
  const dispose = effect[L._dispose].bind(effect);
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
    const key = keys[i] as string | symbol;
    const val = value[key];
    if (typeof val === 'function') {
      value[key] = action(val as (...args: unknown[]) => unknown);
    } else if (
      typeof val === 'object' &&
      val !== null &&
      !(K.brand in (val as Record<PropertyKey, unknown>))
    ) {
      // Recursively wrap nested object properties in actions. This allows users to write
      // nested models without worrying about wrapping their functions in `action`.
      wrapInAction(val as Record<string | symbol, unknown>);
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
          effects[i]?.[K.dispose]();
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
