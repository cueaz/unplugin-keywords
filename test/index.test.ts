import type { UnpluginOptions } from 'unplugin';
import { describe, expect, it } from 'vitest';
import { unpluginFactory } from '../src/index';

const getPlugin = (
  isDev: boolean,
  secret: string,
  framework: string,
): UnpluginOptions => {
  const result = unpluginFactory({ isDev, secret }, { framework });
  return (Array.isArray(result) ? result[0] : result) as UnpluginOptions;
};

describe('integration: unplugin-keywords', () => {
  it('initializes and registers hooks', () => {
    const plugin = getPlugin(false, '123', 'vite');
    expect(plugin.name).toBe('unplugin-keywords');
    expect(typeof plugin.buildStart).toBe('function');
    expect(typeof plugin.resolveId).toBe('object');
    expect(typeof plugin.load).toBe('object');
    expect(typeof plugin.transform).toBe('object');
  });

  it('resolves and loads virtual module content with hashes', async () => {
    const plugin = getPlugin(false, '123', 'rollup');

    // @ts-expect-error test
    await plugin.buildStart.call({});

    const transformContext = {};
    const code = `
      import { myKeyword } from 'virtual:keywords';
      console.log(myKeyword);
    `;

    // @ts-expect-error test
    const transformResult = plugin.transform.handler.call(
      transformContext,
      code,
      'test.ts',
    );

    expect(transformResult).toBeDefined();
    expect(transformResult?.code).toContain('import _$myKeyword from');

    // @ts-expect-error test
    const resolveResult = plugin.resolveId.handler.call(
      {},
      'virtual:keywords/myKeyword',
      'test.ts',
    );
    expect(resolveResult).toBe('\0virtual:keywords/myKeyword');

    // @ts-expect-error test
    const loadResult = plugin.load.handler.call(
      {},
      '\0virtual:keywords/myKeyword',
    );
    expect(loadResult).toBeDefined();
    expect(typeof loadResult).toBe('string');

    expect(loadResult).toMatch(/export default "[a-zA-Z0-9]+";/);
  });

  it('includes debug keyword name in dev mode', async () => {
    const plugin = getPlugin(true, '456', 'webpack');

    // @ts-expect-error test
    await plugin.buildStart.call({});

    const code = `
      import { testDevKey } from 'virtual:keywords';
      console.log(testDevKey);
    `;

    // @ts-expect-error test
    plugin.transform.handler.call({}, code, 'test.ts');

    // @ts-expect-error test
    const loadResult = plugin.load.handler.call(
      {},
      '\0virtual:keywords/testDevKey',
    );

    expect(loadResult).toMatch(/export default "[a-zA-Z0-9]+_testDevKey";/);
  });
});
