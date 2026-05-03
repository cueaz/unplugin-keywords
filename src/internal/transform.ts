import { type PluginObj, type PluginPass, types as t } from '@babel/core';
import { PLUGIN_NAME, VIRTUAL_MODULE_ID } from './constants';
import { encodeIdentifier, toSafeVarName } from './encode';

interface TransformState extends PluginPass {
  keywords: Set<string>;
}

export interface TransformMetadata {
  keywords?: string[];
}

const transformPlugin = (): PluginObj<TransformState> => {
  return {
    name: `${PLUGIN_NAME}:transform`,
    visitor: {
      Program: {
        enter(_, state) {
          state.keywords = new Set<string>();
        },
        exit(path, state) {
          const metadata = state.file.metadata as TransformMetadata;
          metadata.keywords = Array.from(state.keywords);
          const newImports = Array.from(state.keywords).map((keyword) => {
            const encoded = encodeIdentifier(keyword);
            const safeName = toSafeVarName(encoded);
            return t.importDeclaration(
              [t.importDefaultSpecifier(t.identifier(safeName))],
              t.stringLiteral(`${VIRTUAL_MODULE_ID}/${encoded}`),
            );
          });
          if (newImports.length > 0) {
            path.unshiftContainer('body', newImports);
          }
        },
      },
    },
  };
};
