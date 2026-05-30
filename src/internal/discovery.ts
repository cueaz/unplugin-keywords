/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { LimitFunction } from 'p-limit';

const require = createRequire(import.meta.url);

const getPackageRoot = async (
  pkgName: string,
  startDir: string,
): Promise<string | null> => {
  try {
    return path.dirname(
      require.resolve(`${pkgName}/package.json`, { paths: [startDir] }),
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (
      code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' ||
      code === 'MODULE_NOT_FOUND'
    ) {
      try {
        const mainPath = require.resolve(pkgName, { paths: [startDir] });
        let current = path.dirname(mainPath);
        while (current !== path.dirname(current)) {
          try {
            const pkgPath = path.join(current, 'package.json');
            const pkgContent = await readFile(pkgPath, 'utf-8');
            const pkg = JSON.parse(pkgContent);
            if (pkg.name === pkgName) {
              return current;
            }
          } catch {}
          current = path.dirname(current);
        }
      } catch {
        return null;
      }
    }
    return null;
  }
};

export const getKeywordifiedPackages = async (
  root: string,
  limit: LimitFunction,
): Promise<string[]> => {
  const realRoot = await realpath(root).catch(() => root);
  const targetDirs = new Set<string>();
  const visited = new Set<string>();

  let active = 0;
  return new Promise((resolve, reject) => {
    const enqueue = (dir: string) => {
      if (visited.has(dir)) {
        return;
      }
      visited.add(dir);
      active++;

      limit(async () => {
        try {
          const resolvedDir = await realpath(dir).catch(() => dir);
          if (dir !== resolvedDir) {
            if (visited.has(resolvedDir)) {
              return;
            }
            visited.add(resolvedDir);
          }

          const pkgPath = path.join(resolvedDir, 'package.json');
          const pkgContent = await readFile(pkgPath, 'utf-8');
          const pkg = JSON.parse(pkgContent);
          if (pkg.keywordified === true && resolvedDir !== realRoot) {
            targetDirs.add(resolvedDir);
          }

          const allDeps = {
            ...pkg.dependencies,
            ...pkg.peerDependencies,
            ...pkg.optionalDependencies,
            ...(resolvedDir === realRoot ? pkg.devDependencies : {}),
          };
          const depRoots = await Promise.all(
            Object.keys(allDeps).map((dep) => getPackageRoot(dep, resolvedDir)),
          );
          for (const depRoot of depRoots) {
            if (depRoot && !visited.has(depRoot)) {
              enqueue(depRoot);
            }
          }
        } catch {
        } finally {
          active--;
          if (active === 0) {
            resolve(Array.from(targetDirs));
          }
        }
      });
    };

    try {
      enqueue(realRoot);
      if (active === 0) {
        resolve(Array.from(targetDirs));
      }
    } catch (err) {
      reject(err);
    }
  });
};
