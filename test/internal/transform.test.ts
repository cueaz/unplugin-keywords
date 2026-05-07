import { describe, expect, it } from 'vitest';
import {
  extractKeywords,
  transformCode,
} from '../../src/internal/transform.js';

describe('internal/transform', () => {
  describe('transformCode', () => {
    it('transforms named imports', () => {
      const code = `
        import { abc, 'kebab-case' as kebab } from 'virtual:keywords';
        console.log(abc, kebab);
      `;
      const result = transformCode(code, 'test.js');
      expect(result?.keywords).toEqual(new Set(['abc', 'kebab-case']));
      expect(result?.code).toContain(
        'import _$abc from "virtual:keywords/k/abc";',
      );
      expect(result?.code).toContain(
        'import _$kebab$002dcase from "virtual:keywords/k/kebab$002dcase";',
      );
      expect(result?.code).toContain('console.log(_$abc, _$kebab$002dcase);');
    });

    it('transforms default import', () => {
      const code = `
        import myDefault from 'virtual:keywords';
        console.log(myDefault);
      `;
      const result = transformCode(code, 'test.js');
      expect(result?.keywords).toEqual(new Set(['default']));
      expect(result?.code).toContain(
        'import _$default from "virtual:keywords/k/default";',
      );
      expect(result?.code).toContain('console.log(_$default);');
    });

    it('transforms namespace imports and member accesses', () => {
      const code = `
        import * as A from 'virtual:keywords';
        console.log(A.abc);
        console.log(A['sec-wer']);
      `;
      const result = transformCode(code, 'test.js');
      expect(result?.keywords).toEqual(new Set(['abc', 'sec-wer']));
      expect(result?.code).toContain(
        'import _$abc from "virtual:keywords/k/abc";',
      );
      expect(result?.code).toContain(
        'import _$sec$002dwer from "virtual:keywords/k/sec$002dwer";',
      );
      expect(result?.code).toContain('console.log(_$abc);');
      expect(result?.code).toContain('console.log(_$sec$002dwer);');
      expect(result?.code).not.toContain('A.abc');
    });

    it('transforms JSX elements', () => {
      const code = `
        import * as A from 'virtual:keywords';
        import { Abc, div } from 'virtual:keywords';
        const App = () => <A.Component><Abc /><div /></A.Component>;
      `;
      const result = transformCode(code, 'test.tsx');
      expect(result?.keywords).toEqual(new Set(['Component', 'Abc', 'div']));
      expect(result?.code).toContain(
        '<_$Component><_$Abc /><div /></_$Component>',
      );
    });

    it('transforms TypeScript types (value space only)', () => {
      const code = `
        import * as A from 'virtual:keywords';
        import { Abc } from 'virtual:keywords';
        interface Abc {}
        let x: typeof A.myType;
        let y: A.myType;
        type T0 = Abc;
        type T1 = typeof Abc;
        type T2 = (typeof A)['my-indexed-type'];
        type T3 = A.myType;
        interface I {
          [Abc]: typeof Abc;
          [A.myType]: A.myType;
          [A['my-indexed-type']]: A['my-indexed-type'];
        }
      `;
      const result = transformCode(code, 'test.ts');
      expect(result?.keywords).toEqual(
        new Set(['myType', 'my-indexed-type', 'Abc']),
      );
      expect(result?.code).toContain('interface Abc {}');
      expect(result?.code).toContain('let x: typeof _$myType;');
      expect(result?.code).toContain('let y: A.myType;');
      expect(result?.code).toContain('type T0 = Abc;');
      expect(result?.code).toContain('type T1 = typeof _$Abc;');
      expect(result?.code).toContain(
        'type T2 = typeof _$my$002dindexed$002dtype;',
      );
      expect(result?.code).toContain('type T3 = A.myType;');
      expect(result?.code).toContain('[_$Abc]: typeof _$Abc;');
      expect(result?.code).toContain('[_$myType]: A.myType;');
      expect(result?.code).toContain(
        "[_$my$002dindexed$002dtype]: A['my-indexed-type'];",
      );
    });

    it('transforms re-exports', () => {
      const code = `
        export { edf, 'hyphen-export' as myHyphen } from 'virtual:keywords';
      `;
      const result = transformCode(code, 'test.js');
      expect(result?.keywords).toEqual(new Set(['edf', 'hyphen-export']));
      expect(result?.code).toContain(
        'export { default as edf } from "virtual:keywords/k/edf";',
      );
      expect(result?.code).toContain(
        'export { default as myHyphen } from "virtual:keywords/k/hyphen$002dexport";',
      );
    });

    it('protects against local scope shadowing', () => {
      const code = `
        import { abc } from 'virtual:keywords';
        import * as A from 'virtual:keywords';

        function test() {
          const abc = 'shadow';
          const A = { 'sec-wer': 1 };
          console.log(abc);
          console.log(A['sec-wer']);
        }
        console.log(abc);
        console.log(A['sec-wer']);
      `;
      const result = transformCode(code, 'test.js');
      expect(result?.code).toContain("const abc = 'shadow';");
      expect(result?.code).toContain('console.log(abc);');
      expect(result?.code).toContain("console.log(A['sec-wer']);");
    });

    it('protects against top-level identifier collision using Uids', () => {
      const code = `
        import { abc } from 'virtual:keywords';
        const _$abc = 'colliding var';
        console.log(abc, _$abc);
      `;
      const result = transformCode(code, 'test.js');
      expect(result?.code).not.toContain('import _$abc from');
      expect(result?.code).toContain("const _$abc = 'colliding var';");
    });

    it('handles hoisted imports (usage before declaration)', () => {
      const code = `
        console.log(A.abc, kebab);
        import * as A from 'virtual:keywords';
        import { 'kebab-case' as kebab } from 'virtual:keywords';
      `;
      const result = transformCode(code, 'test.js');
      expect(result?.keywords).toEqual(new Set(['abc', 'kebab-case']));
      expect(result?.code).toContain('console.log(_$abc, _$kebab$002dcase);');
      expect(result?.code).toContain(
        'import _$abc from "virtual:keywords/k/abc";',
      );
      expect(result?.code).toContain(
        'import _$kebab$002dcase from "virtual:keywords/k/kebab$002dcase";',
      );
    });
    it('does not transform unrelated object properties or keys', () => {
      const code = `
        import { abc } from 'virtual:keywords';
        const obj = { abc: 1, c: abc };
        console.log(obj.abc);
      `;
      const result = transformCode(code, 'test.js');
      expect(result?.code).toContain('abc: 1,');
      expect(result?.code).toContain('c: _$abc');
      expect(result?.code).toContain('console.log(obj.abc);');
    });
  });

  describe('extractKeywords', () => {
    it('extracts from named imports', () => {
      const code = `import { abc, 'kebab-case' as kebab } from 'virtual:keywords';`;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set(['abc', 'kebab-case']));
    });

    it('extracts from default import', () => {
      const code = `import myDefault from 'virtual:keywords';`;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set(['default']));
    });

    it('extracts from namespace property accesses', () => {
      const code = `
        import * as A from 'virtual:keywords';
        console.log(A.abc);
        console.log(A['sec-wer']);
      `;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set(['abc', 'sec-wer']));
    });

    it('extracts from JSX member accesses', () => {
      const code = `
        import * as A from 'virtual:keywords';
        const App = () => <A.Component />;
      `;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set(['Component']));
    });

    it('extracts from TypeScript qualified names (value space only)', () => {
      const code = `
        import * as A from 'virtual:keywords';
        let x: A.myType;
        let y: typeof A.myType2;
      `;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set(['myType2']));
    });

    it('extracts from TypeScript indexed access types (value space only)', () => {
      const code = `
        import * as A from 'virtual:keywords';
        type T = (typeof A)['my-indexed-type'];
        type T1 = typeof A['my-indexed-type1'];
        type T2 = A['my-indexed-type2'];
        type T3 = (((typeof A)))['my-indexed-type3'];
      `;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(
        new Set(['my-indexed-type', 'my-indexed-type1', 'my-indexed-type3']),
      );
    });

    it('extracts from exported keywords', () => {
      const code = `
        export { edf, 'hyphen-export' as myHyphen } from 'virtual:keywords';
      `;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set(['edf', 'hyphen-export']));
    });

    it('ignores shadowed variables in local scopes', () => {
      const code = `
        import * as A from 'virtual:keywords';
        function test() {
          const A = { 'sec-wer': 1 };
          console.log(A['sec-wer']);
        }
      `;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set([]));
    });

    it('handles hoisted imports (usage before declaration)', () => {
      const code = `
        console.log(A.abc);
        import * as A from 'virtual:keywords';
      `;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set(['abc']));
    });

    it('does not extract unrelated object properties', () => {
      const code = `
        import { abc } from 'virtual:keywords';
        const obj = { abc: 1 };
        console.log(obj.abc);
      `;
      extractKeywords(code);
      const code2 = `
        import * as A from 'virtual:keywords';
        const obj = { A: 1 };
        console.log(obj.A);
      `;
      const keywords2 = extractKeywords(code2);
      expect(keywords2).toEqual(new Set([]));
    });
  });
});
