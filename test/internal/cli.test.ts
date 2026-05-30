/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRunner } from '../../src/internal/cli.js';

describe('internal/cli', () => {
  describe('createRunner', () => {
    const tmpDir = path.join(process.cwd(), '.tmp-cli-test');

    beforeAll(async () => {
      await mkdir(tmpDir, { recursive: true });

      // Root project
      await writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'root-app',
          dependencies: {
            'keywordified-lib': '1.0.0',
          },
        }),
      );
      await writeFile(
        path.join(tmpDir, 'src-file.ts'),
        `
      import * as K from '~keywords';
      const a = K.root_keyword;
      `,
      );

      // node_modules
      const nmDir = path.join(tmpDir, 'node_modules');
      await mkdir(nmDir, { recursive: true });

      // A published library that is keywordified
      const libDir = path.join(nmDir, 'keywordified-lib');
      await mkdir(libDir, { recursive: true });
      await writeFile(
        path.join(libDir, 'package.json'),
        JSON.stringify({
          name: 'keywordified-lib',
          keywordified: true,
        }),
      );
      await writeFile(
        path.join(libDir, 'dist.js'),
        `
      import * as K from '~keywords';
      export const b = K.lib_keyword;
      `,
      );

      // A published library that is not keywordified (should be ignored)
      const badLibDir = path.join(nmDir, 'bad-lib');
      await mkdir(badLibDir, { recursive: true });
      await writeFile(
        path.join(badLibDir, 'package.json'),
        JSON.stringify({
          name: 'bad-lib',
        }),
      );
      await writeFile(
        path.join(badLibDir, 'index.js'),
        `
      import * as K from '~keywords';
      export const c = K.bad_keyword;
      `,
      );
    });

    afterAll(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it('should automatically discover and collect keywords from the root and keywordified libraries', async () => {
      const runner = createRunner({
        root: tmpDir,
        silent: true,
        outDir: '.keywords',
      });

      const keywords = await runner.collect();

      // Should collect from root
      expect(keywords.local.has('root_keyword')).toBe(true);

      // Should automatically collect from keywordified-lib because of zero-config
      expect(keywords.local.has('lib_keyword')).toBe(true);

      // Should not collect from bad-lib because it lacks keywordified: true
      expect(keywords.local.has('bad_keyword')).toBe(false);
    });
  });
});
