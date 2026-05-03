import { beforeAll, describe, expect, it } from 'vitest';
import loadXXHash from 'xxhash-wasm';
import { toShortHash } from '../../src/internal/hash';

describe('internal/hash', () => {
  let xxhash: Awaited<ReturnType<typeof loadXXHash>>;

  beforeAll(async () => {
    xxhash = await loadXXHash();
  });

  describe('toShortHash', () => {
    it('generates a stable deterministic hash for the same input and seed', () => {
      const hash1 = toShortHash(xxhash, 'keyword1', 42);
      const hash2 = toShortHash(xxhash, 'keyword1', 42);
      expect(hash1).toBe(hash2);
      expect(hash1).toBeTruthy();
    });

    it('generates different hashes for different inputs', () => {
      const hash1 = toShortHash(xxhash, 'keyword1', 42);
      const hash2 = toShortHash(xxhash, 'keyword2', 42);
      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for the same input but different seeds', () => {
      const hash1 = toShortHash(xxhash, 'keyword1', 42);
      const hash2 = toShortHash(xxhash, 'keyword1', 43);
      expect(hash1).not.toBe(hash2);
    });

    it('generates hashes composed only of base62 characters', () => {
      const hash = toShortHash(xxhash, 'special@#$*-keyword', 12345);
      expect(hash).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('always generates a hash of exactly 7 characters (fuzz test)', () => {
      // Fuzz test with 10,000 random inputs and seeds
      for (let i = 0; i < 10000; i++) {
        const randomInput = Math.random().toString(36).substring(2) + i;
        const randomSeed = Math.floor(Math.random() * 1000000);
        const hash = toShortHash(xxhash, randomInput, randomSeed);
        expect(hash.length).toBe(7);
      }

      // Edge cases: empty string and zero seed
      expect(toShortHash(xxhash, '', 0).length).toBe(7);
      expect(toShortHash(xxhash, 'a', 0).length).toBe(7);
    });
  });
});
