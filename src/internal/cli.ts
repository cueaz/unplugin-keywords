/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { globby } from 'globby';
import pLimit from 'p-limit';
import { extractKeywords, type KeywordSet } from './transform.js';
import { generateTypeDeclaration } from './typegen.js';

const collectKeywordsFromRoot = async (
  root: string,
  silent: boolean,
  ignoredDirs: string[] = [],
  concurrency: number = 100,
): Promise<KeywordSet> => {
  const collectedKeywords: KeywordSet = { local: new Set(), public: new Set() };

  const start = performance.now();
  if (!silent) {
    console.error('Scanning project files for keywords...');
  }

  const files = await globby('**/*.{js,ts,mjs,mts,jsx,tsx,mjsx,mtsx}', {
    cwd: root,
    absolute: false,
    ignore: ['**/node_modules/**', ...ignoredDirs.map((dir) => `${dir}/**`)],
    gitignore: true,
  });

  let processed = 0;
  const limit = pLimit({ concurrency });
  await limit.map(files, async (file) => {
    try {
      const code = await readFile(file, 'utf-8');
      const keywords = extractKeywords(code);
      if (!keywords) {
        return;
      }
      for (const keyword of keywords.local) {
        collectedKeywords.local.add(keyword);
      }
      for (const keyword of keywords.public) {
        collectedKeywords.public.add(keyword);
      }
      processed++;
    } catch (error) {
      if (!silent) {
        console.error(`Failed to process ${file}: ${error}`);
      }
    }
  });

  const elapsed = performance.now() - start;
  if (!silent) {
    console.error(
      `Scan complete: ${processed}/${files.length} files, ` +
        `${collectedKeywords.local.size} local, ` +
        `${collectedKeywords.public.size} public keywords ` +
        `(${elapsed.toFixed(2)}ms).`,
    );
  }

  return collectedKeywords;
};

const pkgJson = {
  private: true,
  type: 'module',
  sideEffects: false,
  exports: {
    '.': {
      types: './index.d.ts',
    },
    './public': {
      types: './public.d.ts',
    },
  },
};

interface RunnerOptions {
  root: string;
  silent: boolean;
  outDir: string;
}

export const createRunner = (options?: Partial<RunnerOptions>) => {
  const {
    root = process.cwd(),
    silent = false,
    outDir = path.join('node_modules', '~keywords'),
  } = options ?? {};
  return {
    async collect(): Promise<KeywordSet> {
      return collectKeywordsFromRoot(root, silent);
    },

    async save(keywords: KeywordSet): Promise<void> {
      const content = generateTypeDeclaration(keywords.local);
      const publicContent = generateTypeDeclaration(keywords.public, true);
      const outPath = path.join(root, outDir);
      await mkdir(outPath, { recursive: true });
      await writeFile(path.join(outPath, 'index.d.ts'), `${content.trim()}\n`);
      await writeFile(
        path.join(outPath, 'public.d.ts'),
        `${publicContent.trim()}\n`,
      );
      await writeFile(
        path.join(outPath, 'package.json'),
        `${JSON.stringify(pkgJson, null, 2)}\n`,
      );
    },

    async run(): Promise<void> {
      const keywords = await this.collect();
      await this.save(keywords);
    },
  };
};
