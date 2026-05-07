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

interface RunnerOptions {
  root: string;
  silent: boolean;
  dirname: string;
  filename: string;
}

export const createRunner = (options?: Partial<RunnerOptions>) => {
  const {
    root = process.cwd(),
    silent = false,
    dirname = 'node_modules',
    filename = '.keywords.d.ts',
  } = options ?? {};
  return {
    async collect(): Promise<Set<string>> {
      return collectKeywordsFromRoot(root, silent);
    },

    async save(keywords: Set<string>): Promise<void> {
      const content = generateTypeDeclaration(keywords);
      const outDir = path.join(root, dirname);
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, filename), `${content.trim()}\n`);
    },

    async run(): Promise<void> {
      const keywords = await this.collect();
      await this.save(keywords);
    },
  };
};
