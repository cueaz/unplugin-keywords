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
  const modes = ['light', 'dark'] as const;
  const fontBuffers: Map<(typeof modes)[number], Buffer> = new Map();
  let highlighter: Highlighter;

  return {
    name: 'rollup-plugin-code-image',

    async buildStart() {
      highlighter = await createHighlighter({
        langs: ['javascript'],
        themes: modes.map((mode) => `vitesse-${mode}`),
      });
      for (const mode of modes) {
        const weight = mode === 'light' ? '500Medium' : '400Regular';
        const fontPath = path.join(
          'node_modules',
          '@expo-google-fonts',
          'jetbrains-mono',
          weight,
          `JetBrainsMono_${weight}.ttf`,
        );
        fontBuffers.set(mode, await readFile(fontPath));
      }
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
        for (const mode of modes) {
          const { tokens, bg, fg } = highlighter.codeToTokens(code, {
            lang: 'javascript',
            theme: `vitesse-${mode}`,
          });
          const vnode = tokensToVNode(tokens, bg, fg);
          const svg = await satori(vnode, {
            width: 600,
            height: 634,
            fonts: [
              {
                name: 'JetBrains Mono',
                data: fontBuffers.get(mode) as Buffer,
              },
            ],
          });
          const resvg = new Resvg(svg, {
            background: 'transparent',
            fitTo: { mode: 'zoom', value: 3 },
            font: { loadSystemFonts: false },
          });
          const png = resvg.render().asPng();
          const outPath = path.join(outDir, `${fileName}.${mode}.png`);
          await writeFile(outPath, png);
        }
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
    outputOptions: {
      entryFileNames: '[name].min.js',
    },
    checks: {
      pluginTimings: skipImage,
    },
    plugins: [
      keywords({ isDev: false, secret: '' }),
      ...(skipImage ? [] : [image()]),
    ],
  },
]);
