import { describe, expect, it } from 'vitest';
import { VIRTUAL_MODULE_ID } from '../../src/internal/constants';
import {
  COMMON_EXCLUDES,
  resolveId,
  splitQuery,
  toIncludes,
} from '../../src/internal/plugin';

describe('internal/plugin', () => {
  describe('resolveId', () => {
    it('prepends a null byte to the module id', () => {
      expect(resolveId(VIRTUAL_MODULE_ID)).toBe(`\0${VIRTUAL_MODULE_ID}`);
      expect(resolveId('test')).toBe('\0test');
    });
  });

  describe('splitQuery', () => {
    it('splits query parameters from a valid id', () => {
      expect(splitQuery('virtual:keywords?macro=true')).toEqual([
        'virtual:keywords',
        'macro=true',
      ]);
    });

    it('returns undefined for the query if none exists', () => {
      expect(splitQuery('virtual:keywords')).toEqual([
        'virtual:keywords',
        undefined,
      ]);
    });
  });

  describe('toIncludes', () => {
    it('returns an array with a RegExp that strictly matches the start of an ID followed by a slash', () => {
      const regexes = toIncludes(VIRTUAL_MODULE_ID);
      expect(regexes.length).toBe(1);
      const regex = regexes[0];

      expect(regex).toBeDefined();
      expect(regex?.test(`${VIRTUAL_MODULE_ID}/myKeyword`)).toBe(true);
      expect(regex?.test(`${VIRTUAL_MODULE_ID}/`)).toBe(true);
      expect(regex?.test(VIRTUAL_MODULE_ID)).toBe(false);
      expect(regex?.test(`something/${VIRTUAL_MODULE_ID}/`)).toBe(false);
    });
  });

  describe('COMMON_EXCLUDES', () => {
    it('contains a regex that excludes node_modules', () => {
      const regex = COMMON_EXCLUDES[0];
      expect(regex).toBeDefined();
      expect(regex?.test('/path/to/node_modules/pkg/index.js')).toBe(true);
      expect(regex?.test('/path/to/src/index.js')).toBe(false);
    });
  });
});
