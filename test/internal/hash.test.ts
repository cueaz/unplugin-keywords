import { describe, expect, it } from 'vitest';
import { createHasher } from '../../src/internal/hash';

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
      expect(emptyHash.length).toBeGreaterThan(0);
      expect(emptyHash.length).toBeLessThanOrEqual(7);

      // 2. Extremely long string input
      const longInput = 'A'.repeat(10000);
      const longHash = hasher(longInput);
      expect(longHash.length).toBeGreaterThan(0);
      expect(longHash.length).toBeLessThanOrEqual(7);

      // 3. Force a hash collision check with different parameters
      expect(emptyHash).not.toBe(longHash);
    });
  });
});
