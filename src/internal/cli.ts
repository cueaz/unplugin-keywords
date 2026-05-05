import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { globby } from 'globby';
import pLimit from 'p-limit';
import { extractKeywords } from './transform.js';
import { generateTypeDeclaration } from './typegen.js';

const collectKeywordsFromRoot = async (
  root: string,
  silent: boolean,
  ignoredDirs: string[] = [],
  concurrency: number = 100,
): Promise<Set<string>> => {
  const collectedKeywords = new Set<string>();

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
      for (const keyword of keywords) {
        collectedKeywords.add(keyword);
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
      `Scan complete: ${processed}/${files.length} files, ${collectedKeywords.size} unique keywords (${elapsed.toFixed(2)}ms).`,
    );
  }

  return collectedKeywords;
};

interface RunOptions {
  silent: boolean;
  dirname: string;
  filename: string;
}

const runImpl = async (options: RunOptions): Promise<void> => {
  const { silent, dirname, filename } = options;
  const root = process.cwd();
  const keywords = await collectKeywordsFromRoot(root, silent);
  const content = generateTypeDeclaration(keywords);
  const outDir = path.join(root, dirname);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, filename), `${content.trim()}\n`);
};

const runLimit = pLimit({ concurrency: 1 });

export const run = async (options?: Partial<RunOptions>): Promise<void> => {
  const {
    silent = false,
    dirname = 'node_modules',
    filename = '.keywords.d.ts',
  } = options ?? {};
  runLimit.clearQueue();
  await runLimit(() => runImpl({ silent, dirname, filename }));
};
