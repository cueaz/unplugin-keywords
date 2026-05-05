import { defineConfig } from 'tsdown';
import keywords from 'unplugin-keywords/rollup';

export default defineConfig([
  {
    entry: {
      '*': 'src/*.ts',
    },
    clean: true,
    dts: true,
    sourcemap: false,
    fixedExtension: false,
    minify: true,
    plugins: [keywords({ isDev: false, secret: '' })],
  },
]);
