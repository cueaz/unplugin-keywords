import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { globby } from 'globby';
import pLimit from 'p-limit';
import { extractKeywords } from '../internal/extract';
import { generateTypeDeclaration } from '../internal/typegen';

const collectKeywordsFromRoot = async (
  root: string,
  ignoredDirs: string[] = [],
  concurrency: number = 100,
): Promise<Set<string>> => {
  const collectedKeywords = new Set<string>();

  console.error('Scanning project files for keywords...');

  const files = await globby('**/*.{js,ts,mjs,mts,jsx,tsx,mjsx,mtsx}', {
    cwd: root,
    absolute: false,
    ignore: ['**/node_modules/**', ...ignoredDirs.map((dir) => `${dir}/**`)],
    gitignore: true,
  });

  const limit = pLimit(concurrency);
  await Promise.all(
    files.map((file) =>
      limit(async () => {
        try {
          const code = await readFile(file, 'utf-8');
          const keywords = extractKeywords(code);
          for (const keyword of keywords) {
            collectedKeywords.add(keyword);
          }
        } catch (error) {
          console.error(`Failed to process ${file}: ${error}`);
        }
      }),
    ),
  );

  console.error(
    `Scan complete. Found ${collectedKeywords.size} unique keywords.`,
  );

  return collectedKeywords;
};

const main = async (
  dirname: string = 'node_modules',
  filename: string = '.keywords.d.ts',
): Promise<void> => {
  const root = process.cwd();
  const keywords = await collectKeywordsFromRoot(root);
  const content = generateTypeDeclaration(keywords);
  const outDir = path.join(root, dirname);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, filename), `${content.trim()}\n`);
};

await main();
