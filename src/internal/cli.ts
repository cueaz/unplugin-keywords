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
  const collectedKeywords: KeywordSet = { main: new Set(), lex: new Set() };

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
      for (const keyword of keywords.main) {
        collectedKeywords.main.add(keyword);
      }
      for (const keyword of keywords.lex) {
        collectedKeywords.lex.add(keyword);
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
      `Scan complete: ${processed}/${files.length} files, ${collectedKeywords.main.size} main, ${collectedKeywords.lex.size} lex keywords (${elapsed.toFixed(2)}ms).`,
    );
  }

  return collectedKeywords;
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
    outDir = path.join('node_modules', '.keywords'),
  } = options ?? {};
  return {
    async collect(): Promise<KeywordSet> {
      return collectKeywordsFromRoot(root, silent);
    },

    async save(keywords: KeywordSet): Promise<void> {
      const content = generateTypeDeclaration(keywords.main);
      const lexContent = generateTypeDeclaration(keywords.lex, true);
      const outPath = path.join(root, outDir);
      await mkdir(outPath, { recursive: true });
      await writeFile(path.join(outPath, 'index.d.ts'), `${content.trim()}\n`);
      await writeFile(path.join(outPath, 'lex.d.ts'), `${lexContent.trim()}\n`);
    },

    async run(): Promise<void> {
      const keywords = await this.collect();
      await this.save(keywords);
    },
  };
};
