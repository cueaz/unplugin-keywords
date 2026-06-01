/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import pLimit, { type LimitFunction } from 'p-limit';
import { getKeywordifiedPackages } from './discovery.js';
import {
  extractKeywords,
  type KeywordSet,
  preprocessForExtract,
} from './transform.js';
import { generateTypeDeclaration } from './typegen.js';

const EXTENSIONS = /\.(?:m?[jt]sx?|svelte)$/;

const getIgnorer = async (
  dir: string,
  defaultIgnores: string[] = [],
): Promise<Ignore> => {
  const ig = ignore().add(defaultIgnores);
  try {
    const gitignorePath = path.join(dir, '.gitignore');
    const content = await readFile(gitignorePath, 'utf-8');
    ig.add(content);
  } catch {}
  return ig;
};

const walkDir = async (
  startDir: string,
  baseDir: string,
  ig: Ignore,
  files: string[],
  limit: LimitFunction,
): Promise<void> => {
  let active = 0;
  return new Promise((resolve, reject) => {
    const enqueue = (dir: string) => {
      active++;
      limit(async () => {
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name === '.git' || entry.name === 'node_modules') {
              continue;
            }
            const fullPath = path.join(dir, entry.name);
            const relPath = path
              .relative(baseDir, fullPath)
              .replace(/\\/g, '/');
            if (ig.ignores(relPath)) {
              continue;
            }
            if (entry.isDirectory()) {
              enqueue(fullPath);
            } else if (entry.isFile() && EXTENSIONS.test(entry.name)) {
              files.push(fullPath);
            }
          }
        } catch {
        } finally {
          active--;
          if (active === 0) {
            resolve();
          }
        }
      });
    };
    try {
      enqueue(startDir);
      if (active === 0) {
        resolve();
      }
    } catch (err) {
      reject(err);
    }
  });
};

const collectKeywordsFromRoot = async (
  root: string,
  silent: boolean,
  ignorePatterns: string[] = [],
  concurrency: number = 100,
): Promise<KeywordSet> => {
  const collectedKeywords: KeywordSet = {
    local: new Set(),
    public: new Set(),
    raw: new Set(),
  };

  const start = performance.now();
  if (!silent) {
    console.error('Scanning project files for keywords...');
  }

  const limit = pLimit({ concurrency });
  const keywordifiedDirs = await getKeywordifiedPackages(root, limit);
  const targetDirs = [root, ...keywordifiedDirs];

  const allFiles: string[] = [];
  await Promise.all(
    targetDirs.map(async (dir) => {
      const ig = await getIgnorer(dir, dir === root ? ignorePatterns : []);
      await walkDir(dir, dir, ig, allFiles, limit);
    }),
  );

  let processed = 0;
  await limit.map(allFiles, async (file) => {
    let code: string | null;
    try {
      code = await readFile(file, 'utf-8');
    } catch {
      return;
    }
    code = await preprocessForExtract(code, file);
    if (!code) {
      return;
    }
    const keywords = extractKeywords(code, file);
    if (!keywords) {
      return;
    }
    for (const keyword of keywords.local) {
      collectedKeywords.local.add(keyword);
    }
    for (const keyword of keywords.public) {
      collectedKeywords.public.add(keyword);
    }
    for (const keyword of keywords.raw) {
      collectedKeywords.raw.add(keyword);
    }
    processed++;
  });

  const elapsed = performance.now() - start;
  if (!silent) {
    console.error(
      `Scan complete: ${processed}/${allFiles.length} files, ` +
        `${collectedKeywords.local.size} local, ` +
        `${collectedKeywords.public.size} public, ` +
        `${collectedKeywords.raw.size} raw keywords ` +
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
    './raw': {
      types: './raw.d.ts',
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
      const publicContent = generateTypeDeclaration(keywords.public, 'public');
      const rawContent = generateTypeDeclaration(keywords.raw, 'raw');
      const outPath = path.join(root, outDir);
      await mkdir(outPath, { recursive: true });
      await writeFile(path.join(outPath, 'index.d.ts'), `${content.trim()}\n`);
      await writeFile(
        path.join(outPath, 'public.d.ts'),
        `${publicContent.trim()}\n`,
      );
      await writeFile(path.join(outPath, 'raw.d.ts'), `${rawContent.trim()}\n`);
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
