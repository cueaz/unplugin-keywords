import { describe, expect, it } from 'vitest';
import { encodeIdentifier, toSafeVarName } from '../../src/internal/encode.js';

describe('internal/encode', () => {
  describe('encodeIdentifier', () => {
    it('encodes standard alphanumeric identifiers identically', () => {
      expect(encodeIdentifier('myKeyword')).toBe('myKeyword');
      expect(encodeIdentifier('A123_b')).toBe('A123_b');
    });

    it('escapes $ character correctly', () => {
      expect(encodeIdentifier('$test')).toBe('$$test');
      expect(encodeIdentifier('a$b')).toBe('a$$b');
    });

    it('escapes non-alphanumeric characters with hex codes', () => {
      expect(encodeIdentifier('kebab-case')).toBe('kebab$002dcase');
      expect(encodeIdentifier('my@keyword')).toBe('my$0040keyword');
      expect(encodeIdentifier('hello world')).toBe('hello$0020world');
    });

    it('handles purely special characters', () => {
      expect(encodeIdentifier('-')).toBe('$002d');
      expect(encodeIdentifier('@#')).toBe('$0040$0023');
    });
  });

  describe('toSafeVarName', () => {
    it('prepends _$ to the encoded string', () => {
      expect(toSafeVarName('myKeyword')).toBe('_$myKeyword');
      expect(toSafeVarName('kebab$002dcase')).toBe('_$kebab$002dcase');
    });
  });
});
