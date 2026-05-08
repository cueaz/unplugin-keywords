import { describe, expect, it } from 'vitest';
import { generateTypeDeclaration } from '../../src/internal/typegen.js';

describe('internal/typegen', () => {
  describe('generateTypeDeclaration', () => {
    it('generates correct typescript definitions for an empty set', () => {
      const keywords = new Set<string>();
      const output = generateTypeDeclaration(keywords);

      // expect(output).toContain(
      //   'type Keyword<K, V> = V & { readonly __keyword__: K };',
      // );
      expect(output).toContain('export {');
      expect(output).toContain('};');
    });

    it('generates definitions for valid identifiers', () => {
      const keywords = new Set(['abc', 'SET_USER']);
      const output = generateTypeDeclaration(keywords);

      expect(output).toContain('declare const _$SET_USER: "*******.SET_USER";');
      expect(output).toContain('declare const _$abc: "*******.abc";');
      expect(output).toContain('_$SET_USER as "SET_USER",');
      expect(output).toContain('_$abc as "abc",');
    });

    it('generates definitions for local identifiers', () => {
      const keywords = new Set(['abc', 'SET_USER']);
      const output = generateTypeDeclaration(keywords, true);

      expect(output).toContain('declare const _$SET_USER: "==.SET_USER";');
      expect(output).toContain('declare const _$abc: "==.abc";');
      expect(output).toContain('_$SET_USER as "SET_USER",');
      expect(output).toContain('_$abc as "abc",');
    });

    it('generates definitions for non-standard identifiers', () => {
      const keywords = new Set(['kebab-case', '@special']);
      const output = generateTypeDeclaration(keywords);

      expect(output).toContain(
        'declare const _$kebab$002dcase: "*******.kebab-case";',
      );
      expect(output).toContain(
        'declare const _$$0040special: "*******.@special";',
      );
      expect(output).toContain('_$kebab$002dcase as "kebab-case",');
      expect(output).toContain('_$$0040special as "@special",');
    });

    it('sorts the output predictably', () => {
      const keywords1 = new Set(['c', 'a', 'b']);
      const keywords2 = new Set(['a', 'b', 'c']);

      const output1 = generateTypeDeclaration(keywords1);
      const output2 = generateTypeDeclaration(keywords2);

      expect(output1).toBe(output2);

      const indexOfA = output1.indexOf('_$a as "a"');
      const indexOfB = output1.indexOf('_$b as "b"');
      const indexOfC = output1.indexOf('_$c as "c"');

      expect(indexOfA).toBeLessThan(indexOfB);
      expect(indexOfB).toBeLessThan(indexOfC);
    });
  });
});
