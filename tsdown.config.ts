import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: {
      '*': 'src/*.ts',
    },
    clean: true,
    dts: {
      sourcemap: true,
    },
    sourcemap: true,
    fixedExtension: false,
  },
  {
    entry: {
      'bin/*': 'src/bin/*.ts',
    },
    clean: false, // Don't clean again if the first config already did
    dts: false,
    sourcemap: true,
    fixedExtension: false,
  },
]);
