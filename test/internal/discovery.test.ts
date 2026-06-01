/**
 * @license
 * Copyright 2026-present cueaz
 * SPDX-License-Identifier: MIT
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import pLimit from 'p-limit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getKeywordifiedPackages } from '../../src/internal/discovery.js';

describe('internal/discovery', () => {
  describe('getKeywordifiedPackages', () => {
    const tmpDir = path.join(process.cwd(), '.tmp-discovery-test');

    beforeAll(async () => {
      await mkdir(tmpDir, { recursive: true });

      // Create root package.json
      await writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'root-app',
          dependencies: {
            'lib-a': '1.0.0',
            'lib-b': '1.0.0',
          },
        }),
      );

      // Create node_modules
      const nmDir = path.join(tmpDir, 'node_modules');
      await mkdir(nmDir, { recursive: true });

      // lib-a: not keywordified
      const libA = path.join(nmDir, 'lib-a');
      await mkdir(libA, { recursive: true });
      await writeFile(
        path.join(libA, 'package.json'),
        JSON.stringify({
          name: 'lib-a',
          main: 'index.js',
        }),
      );
      await writeFile(path.join(libA, 'index.js'), '');

      // lib-b: keywordified, depends on lib-c and lib-circ
      const libB = path.join(nmDir, 'lib-b');
      await mkdir(libB, { recursive: true });
      await writeFile(
        path.join(libB, 'package.json'),
        JSON.stringify({
          name: 'lib-b',
          keywordified: true,
          main: 'index.js',
          dependencies: {
            'lib-c': '1.0.0',
            'lib-circ': '1.0.0', // Circular dependency entry
            'missing-lib': '1.0.0', // Edge Case: Uninstalled dependency
          },
        }),
      );
      await writeFile(path.join(libB, 'index.js'), '');

      // lib-c: keywordified, has strict exports blocking package.json
      const libC = path.join(nmDir, 'lib-c');
      await mkdir(libC, { recursive: true });
      await writeFile(
        path.join(libC, 'package.json'),
        JSON.stringify({
          name: 'lib-c',
          keywordified: true,
          main: 'index.js',
          exports: {
            '.': './index.js', // Blocks require.resolve('lib-c/package.json')
          },
          peerDependencies: {
            'lib-peer': '1.0.0',
          },
          devDependencies: {
            'lib-dev-ignored': '1.0.0', // Should be ignored because not root
          },
        }),
      );
      await writeFile(path.join(libC, 'index.js'), 'module.exports = {}');

      // lib-peer: keywordified (resolved via peerDependencies)
      const libPeer = path.join(nmDir, 'lib-peer');
      await mkdir(libPeer, { recursive: true });
      await writeFile(
        path.join(libPeer, 'package.json'),
        JSON.stringify({
          name: 'lib-peer',
          keywordified: true,
          main: 'index.js',
        }),
      );
      await writeFile(path.join(libPeer, 'index.js'), '');

      // lib-circ: keywordified, points back to lib-b
      const libCirc = path.join(nmDir, 'lib-circ');
      await mkdir(libCirc, { recursive: true });
      await writeFile(
        path.join(libCirc, 'package.json'),
        JSON.stringify({
          name: 'lib-circ',
          keywordified: true,
          main: 'index.js',
          dependencies: {
            'lib-b': '1.0.0', // Circular
          },
        }),
      );
      await writeFile(path.join(libCirc, 'index.js'), '');

      // lib-dev-ignored: keywordified, but should not be resolved
      const libDevIgnored = path.join(nmDir, 'lib-dev-ignored');
      await mkdir(libDevIgnored, { recursive: true });
      await writeFile(
        path.join(libDevIgnored, 'package.json'),
        JSON.stringify({
          name: 'lib-dev-ignored',
          keywordified: true,
          main: 'index.js',
        }),
      );
      await writeFile(path.join(libDevIgnored, 'index.js'), '');
    });

    afterAll(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it('should handle complex graphs, circular dependencies, exports restrictions, and missing packages', async () => {
      const limit = pLimit(50);
      const packages = await getKeywordifiedPackages(tmpDir, limit);

      expect(packages.length).toBe(4); // lib-b, lib-c, lib-peer, lib-circ
      expect(packages).toContain(path.join(tmpDir, 'node_modules', 'lib-b'));
      expect(packages).toContain(path.join(tmpDir, 'node_modules', 'lib-c'));
      expect(packages).toContain(path.join(tmpDir, 'node_modules', 'lib-peer'));
      expect(packages).toContain(path.join(tmpDir, 'node_modules', 'lib-circ'));

      // Not keywordified
      expect(packages).not.toContain(
        path.join(tmpDir, 'node_modules', 'lib-a'),
      );

      // Nested devDependencies should be completely ignored
      expect(packages).not.toContain(
        path.join(tmpDir, 'node_modules', 'lib-dev-ignored'),
      );
    });
  });
});
