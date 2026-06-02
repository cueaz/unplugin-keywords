/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from 'vitest';
import { generateTypeDeclaration } from '../../src/internal/typegen.js';

describe('internal/typegen', () => {
  describe('generateTypeDeclaration', () => {
    it('generates correct typescript definitions for an empty set', () => {
      const keywords = new Set<string>();
      const output = generateTypeDeclaration(keywords, '~keywords');

      expect(output).toContain("declare module '~keywords' {");
      expect(output).toContain('  export {');
      expect(output).toContain('  };');
      expect(output).toContain('}');
    });

    it('generates definitions for valid identifiers', () => {
      const keywords = new Set(['abc', 'SET_USER']);
      const output = generateTypeDeclaration(keywords, '~keywords');

      expect(output).toContain("declare module '~keywords' {");
      expect(output).toContain('  const _$SET_USER: "==.SET_USER";');
      expect(output).toContain('  const _$abc: "==.abc";');
      expect(output).toContain('_$SET_USER as "SET_USER",');
      expect(output).toContain('_$abc as "abc",');
    });

    it('generates definitions for public identifiers', () => {
      const keywords = new Set(['abc', 'SET_USER']);
      const output = generateTypeDeclaration(
        keywords,
        '~keywords/public',
        'public',
      );

      expect(output).toContain("declare module '~keywords/public' {");
      expect(output).toContain('  const _$SET_USER: "*******.SET_USER";');
      expect(output).toContain('  const _$abc: "*******.abc";');
      expect(output).toContain('_$SET_USER as "SET_USER",');
      expect(output).toContain('_$abc as "abc",');
    });

    it('generates definitions for raw identifiers', () => {
      const keywords = new Set(['function', 'object']);
      const output = generateTypeDeclaration(keywords, '~keywords/raw', 'raw');

      expect(output).toContain("declare module '~keywords/raw' {");
      expect(output).toContain('  const _$function: "function";');
      expect(output).toContain('  const _$object: "object";');
      expect(output).toContain('_$function as "function",');
      expect(output).toContain('_$object as "object",');
    });

    it('generates definitions for non-standard identifiers', () => {
      const keywords = new Set(['kebab-case', '@special']);
      const output = generateTypeDeclaration(keywords, '~keywords');

      expect(output).toContain('  const _$kebab$002dcase: "==.kebab-case";');
      expect(output).toContain('  const _$$0040special: "==.@special";');
      expect(output).toContain('_$kebab$002dcase as "kebab-case",');
      expect(output).toContain('_$$0040special as "@special",');
    });

    it('sorts the output predictably', () => {
      const keywords1 = new Set(['c', 'a', 'b']);
      const keywords2 = new Set(['a', 'b', 'c']);

      const output1 = generateTypeDeclaration(keywords1, '~keywords');
      const output2 = generateTypeDeclaration(keywords2, '~keywords');

      expect(output1).toBe(output2);

      const indexOfA = output1.indexOf('_$a as "a"');
      const indexOfB = output1.indexOf('_$b as "b"');
      const indexOfC = output1.indexOf('_$c as "c"');

      expect(indexOfA).toBeLessThan(indexOfB);
      expect(indexOfB).toBeLessThan(indexOfC);
    });
  });
});
