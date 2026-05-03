import { describe, expect, it } from 'vitest';
import { extractKeywords } from '../../src/internal/extract';

describe('internal/extract', () => {
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

    it('extracts from TypeScript qualified names', () => {
      const code = `
        import * as A from 'virtual:keywords';
        let x: A.myType;
      `;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set(['myType']));
    });

    it('extracts from TypeScript indexed access types', () => {
      const code = `
        import * as A from 'virtual:keywords';
        type T = (typeof A)['my-indexed-type'];
      `;
      const keywords = extractKeywords(code);
      expect(keywords).toEqual(new Set(['my-indexed-type']));
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
  });
});
