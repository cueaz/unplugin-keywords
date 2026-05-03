import { describe, expect, it } from 'vitest';
import { transformCode } from '../../src/internal/transform';

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
        'import _$abc from "virtual:keywords/abc";',
      );
      expect(result?.code).toContain(
        'import _$kebab$002dcase from "virtual:keywords/kebab$002dcase";',
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
        'import _$default from "virtual:keywords/default";',
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
        'import _$abc from "virtual:keywords/abc";',
      );
      expect(result?.code).toContain(
        'import _$sec$002dwer from "virtual:keywords/sec$002dwer";',
      );
      expect(result?.code).toContain('console.log(_$abc);');
      expect(result?.code).toContain('console.log(_$sec$002dwer);');
      expect(result?.code).not.toContain('A.abc');
    });

    it('transforms JSX elements', () => {
      const code = `
        import * as A from 'virtual:keywords';
        import { abc } from 'virtual:keywords';
        const App = () => <A.Component><abc /></A.Component>;
      `;
      const result = transformCode(code, 'test.tsx');
      expect(result?.keywords).toEqual(new Set(['Component', 'abc']));
      expect(result?.code).toContain('<_$Component><_$abc /></_$Component>');
    });

    it('transforms TypeScript types', () => {
      const code = `
        import * as A from 'virtual:keywords';
        let x: A.myType;
        type T = (typeof A)['my-indexed-type'];
      `;
      const result = transformCode(code, 'test.ts');
      expect(result?.keywords).toEqual(new Set(['myType', 'my-indexed-type']));
      expect(result?.code).toContain('let x: _$myType;');
      expect(result?.code).toContain(
        'type T = typeof _$my$002dindexed$002dtype;',
      );
    });

    it('transforms re-exports', () => {
      const code = `
        export { edf, 'hyphen-export' as myHyphen } from 'virtual:keywords';
      `;
      const result = transformCode(code, 'test.js');
      expect(result?.keywords).toEqual(new Set(['edf', 'hyphen-export']));
      expect(result?.code).toContain(
        'export { default as edf } from "virtual:keywords/edf";',
      );
      expect(result?.code).toContain(
        'export { default as myHyphen } from "virtual:keywords/hyphen$002dexport";',
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
        'import _$abc from "virtual:keywords/abc";',
      );
      expect(result?.code).toContain(
        'import _$kebab$002dcase from "virtual:keywords/kebab$002dcase";',
      );
    });
  });
});
