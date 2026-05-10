/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from 'vitest';
import { createCounter, createHasher } from '../../src/internal/hash.js';

describe('internal/hash', () => {
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

    it('generates outputs starting with [Alpha][Digit]', () => {
      const counter = createCounter('format-key');

      for (let i = 0; i < 100; i++) {
        const result = counter(`kw_${i}`);
        expect(result).toMatch(/^[a-zA-Z][0-9]/);
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

      // Individual collisions are possible (1/520 per slot),
      // but the full sequence must differ.
      expect(results1).not.toEqual(results2);
    });

    it('produces minimum length of 2 characters', () => {
      const counter = createCounter('min-length-key');

      for (let i = 0; i < 50; i++) {
        const result = counter(`k${i}`);
        expect(result.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('transitions to 3+ character output after exhausting 2-char space (52×10=520)', () => {
      const counter = createCounter('boundary-key');

      const results: string[] = [];
      for (let i = 0; i < 600; i++) {
        results.push(counter(`kw_${i}`));
      }

      // First 520 should be 2 characters: [Alpha(52)] × [Digit(10)]
      for (let i = 0; i < 520; i++) {
        expect(results[i]?.length).toBe(2);
      }

      // After 520, should grow to 3+ characters
      for (let i = 520; i < 600; i++) {
        expect(results[i]?.length ?? 0).toBeGreaterThanOrEqual(3);
      }
    });

    it('guarantees uniqueness across the full 2-char + 3-char boundary', () => {
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
  });
});
