/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import blacklist from 'virtual:blacklist';
import { describe, expect, it } from 'vitest';
import { createCounter, createHasher } from '../../src/internal/hash.js';

describe('internal/hash', () => {
  describe('blacklist coverage', () => {
    it('contains dangerous Promise and Object serialization hooks', () => {
      const dangerousKeys = [
        // Promise / Thenable hazards
        'then',
        'catch',
        'finally',
        // Serialization / Coercion
        'toString',
        'valueOf',
        'toJSON',
        'toLocaleString',
        // Object properties
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'constructor',
        // Prototype pollution vectors (manual additions)
        '__proto__',
        'prototype',
        '__defineGetter__',
        '__defineSetter__',
        '__lookupGetter__',
        '__lookupSetter__',
      ];

      const missing = dangerousKeys.filter((key) => !blacklist.has(key));
      expect(missing).toEqual([]);
    });
  });

  describe('createHasher', () => {
    it('generates a stable deterministic hash for the same input and key', () => {
      const hasher1 = createHasher('my-secret-key');
      const hasher2 = createHasher('my-secret-key');
      const hash1 = hasher1('keyword1');
      const hash2 = hasher2('keyword1');
      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different inputs', () => {
      const hasher = createHasher('my-secret-key');
      const hash1 = hasher('keyword1');
      const hash2 = hasher('keyword2');
      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for the same input but different keys', () => {
      const hasher1 = createHasher('my-secret-key-1');
      const hasher2 = createHasher('my-secret-key-2');
      const hash1 = hasher1('keyword1');
      const hash2 = hasher2('keyword1');
      expect(hash1).not.toBe(hash2);
    });

    it('generates hashes composed only of base62 characters', () => {
      const hasher = createHasher('my-secret-key');
      const hash = hasher('special@#$*-keyword');
      expect(hash).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('generates hashes starting with [Alpha]', () => {
      const hasher = createHasher('format-key');
      for (let i = 0; i < 100; i++) {
        const hash = hasher(`kw_${i}`);
        expect(hash).toMatch(/^[a-zA-Z]/);
      }
    });

    it('handles boundary value edge cases correctly', () => {
      const hasher = createHasher('boundary-key');

      // 1. Empty string input
      const emptyHash = hasher('');
      expect(emptyHash.length).toBe(7);

      // 2. Extremely long string input
      const longInput = 'A'.repeat(10000);
      const longHash = hasher(longInput);
      expect(longHash.length).toBe(7);

      // 3. Force a hash collision check with different parameters
      expect(emptyHash).not.toBe(longHash);
    });

    it('never generates a blacklisted identifier', () => {
      const hasher = createHasher('blacklist-key');
      for (let i = 0; i < 1000; i++) {
        const hash = hasher(`bl_${i}`);
        expect(blacklist.has(hash)).toBe(false);
      }
    });
  });

  describe('createCounter', () => {
    it('generates deterministic output for the same secret', () => {
      const counter1 = createCounter('my-secret-key');
      const counter2 = createCounter('my-secret-key');

      const results1 = ['a', 'b', 'c'].map((k) => counter1(k));
      const results2 = ['a', 'b', 'c'].map((k) => counter2(k));

      expect(results1).toEqual(results2);
    });

    it('generates unique output for each distinct input', () => {
      const counter = createCounter('my-secret-key');
      const results = new Set<string>();

      for (let i = 0; i < 100; i++) {
        results.add(counter(`keyword_${i}`));
      }

      expect(results.size).toBe(100);
    });

    it('returns cached result for repeated input', () => {
      const counter = createCounter('my-secret-key');

      const first = counter('repeated');
      const second = counter('repeated');

      expect(first).toBe(second);
    });

    it('generates outputs starting with [Alpha]', () => {
      const counter = createCounter('format-key');

      for (let i = 0; i < 100; i++) {
        const result = counter(`kw_${i}`);
        expect(result).toMatch(/^[a-zA-Z]/);
      }
    });

    it('generates different sequences for different secrets', () => {
      const counter1 = createCounter('secret-1');
      const counter2 = createCounter('secret-2');

      const results1: string[] = [];
      const results2: string[] = [];
      for (let i = 0; i < 10; i++) {
        results1.push(counter1(`input_${i}`));
        results2.push(counter2(`input_${i}`));
      }

      // Individual collisions are possible (1/52 per slot),
      // but the full sequence must differ.
      expect(results1).not.toEqual(results2);
    });

    it('produces 1-character identifiers', () => {
      const counter = createCounter('one-char-key');
      const result = counter('first');
      expect(result.length).toBe(1);
      expect(result).toMatch(/^[a-zA-Z]$/);
    });

    it('produces minimum length of 1 character', () => {
      const counter = createCounter('min-length-key');

      for (let i = 0; i < 50; i++) {
        const result = counter(`k${i}`);
        expect(result.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('transitions to 2+ character output after exhausting 1-char space', () => {
      const counter = createCounter('boundary-key');

      const results: string[] = [];
      // Generate enough to exhaust 1-char space (52 alpha - blacklisted)
      for (let i = 0; i < 100; i++) {
        results.push(counter(`kw_${i}`));
      }

      const oneChar = results.filter((r) => r.length === 1);
      const twoChar = results.filter((r) => r.length === 2);

      // Most 1-char slots should be used (52 - small blacklist ~= 51)
      expect(oneChar.length).toBeGreaterThanOrEqual(40);
      expect(oneChar.length).toBeLessThanOrEqual(52);

      // Remaining should be 2+ chars
      expect(twoChar.length).toBeGreaterThan(0);
    });

    it('guarantees uniqueness across character length boundaries', () => {
      const counter = createCounter('uniqueness-key');
      const seen = new Set<string>();

      for (let i = 0; i < 600; i++) {
        const result = counter(`unique_${i}`);
        expect(seen.has(result)).toBe(false);
        seen.add(result);
      }
    });

    it('generates only base62 characters in all positions', () => {
      const counter = createCounter('charset-key');

      for (let i = 0; i < 600; i++) {
        const result = counter(`ch_${i}`);
        expect(result).toMatch(/^[a-zA-Z0-9]+$/);
      }
    });

    it('never generates a blacklisted identifier', () => {
      const counter = createCounter('blacklist-key');

      for (let i = 0; i < 5000; i++) {
        const result = counter(`bl_${i}`);
        expect(blacklist.has(result)).toBe(false);
      }
    });
  });
});
