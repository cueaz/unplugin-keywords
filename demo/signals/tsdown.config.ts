import { defineConfig } from 'tsdown';
import keywords from 'unplugin-keywords/rollup';

const isDev = false;

export default defineConfig([
  {
    entry: ['src/*.ts', '!src/*.d.ts'],
    clean: true,
    dts: false,
    sourcemap: false,
    fixedExtension: false,
    minify: true,
    plugins: [keywords({ isDev, secret: '' })],
    define: {
      'import.meta.custom.DEV_MODE': JSON.stringify(isDev),
    },
  },
]);
