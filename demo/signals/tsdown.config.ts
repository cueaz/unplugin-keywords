import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { createHighlighter, type Highlighter, type ThemedToken } from 'shiki';
import { defineConfig } from 'tsdown';
import keywords from 'unplugin-keywords/rollup';

const skipImage = !!(process.env as { NO_IMAGE?: string }).NO_IMAGE;

type VNode = Parameters<typeof satori>[0];

const tokensToVNode = (
  tokens: ThemedToken[][],
  bg?: string,
  fg?: string,
): VNode => {
  const children: VNode[] = [];
  for (const line of tokens) {
    for (const token of line) {
      for (const char of token.content) {
        children.push({
          type: 'span',
          props: {
            style: {
              color: token.color,
            },
            children: char === ' ' ? '\u00A0' : char,
          },
        });
      }
    }
    children.push({
      type: 'span',
      props: { children: '\u21B5' },
    });
  }
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        backgroundColor: bg,
        color: fg,
        padding: '2px',
      },
      children,
    },
  };
};

function image() {
  const lang = 'javascript';
  const theme = 'vitesse-dark';
  let highlighter: Highlighter;
  let fontBuffer: Buffer;

  return {
    name: 'rollup-plugin-code-image',

    async buildStart() {
      highlighter = await createHighlighter({
        langs: [lang],
        themes: [theme],
      });
      const fontPath = path.join(
        'node_modules',
        '@expo-google-fonts',
        'jetbrains-mono',
        '400Regular',
        'JetBrainsMono_400Regular.ttf',
      );
      fontBuffer = await readFile(fontPath);
    },

    async writeBundle(
      options: { dir: string },
      bundle: Record<string, { code: string }>,
    ) {
      const outDir = options.dir;
      for (const fileName of Object.keys(bundle)) {
        const code = bundle[fileName]?.code;
        if (!fileName.endsWith('.js') || !code) {
          continue;
        }
        const { tokens, bg, fg } = highlighter.codeToTokens(code, {
          lang,
          theme,
        });
        const vnode = tokensToVNode(tokens, bg, fg);
        const svg = await satori(vnode, {
          width: 600,
          height: 634,
          fonts: [
            {
              name: 'JetBrains Mono',
              data: fontBuffer,
              weight: 400,
              style: 'normal',
            },
          ],
        });
        const resvg = new Resvg(svg, {
          background: 'transparent',
          fitTo: { mode: 'zoom', value: 3 },
          font: { loadSystemFonts: false },
        });
        const png = resvg.render().asPng();
        const outPath = path.join(outDir, `${fileName}.png`);
        await writeFile(outPath, png);
      }
    },
  };
}

export default defineConfig([
  {
    entry: ['src/*.ts', '!src/*.d.ts'],
    clean: true,
    dts: false,
    sourcemap: false,
    fixedExtension: false,
    minify: true,
    checks: {
      pluginTimings: false,
    },
    plugins: [
      keywords({ isDev: false, secret: '' }),
      ...(skipImage ? [] : [image()]),
    ],
    define: {
      'import.meta.custom.DEV_MODE': JSON.stringify(false),
    },
  },
]);
