import {
  type BabelFileResult,
  type PluginObj,
  type PluginPass,
  types as t,
  transformSync,
} from '@babel/core';
import { PLUGIN_NAME, VIRTUAL_MODULE_ID } from './constants';
import { encodeIdentifier, toSafeVarName } from './encode';

interface TransformState extends PluginPass {
  keywords: Set<string>;
}

interface TransformMetadata {
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

      ImportDeclaration(path, state) {
        if (path.node.source.value !== VIRTUAL_MODULE_ID) {
          return;
        }

        for (const specifierPath of path.get('specifiers')) {
          const localName = specifierPath.node.local.name;
          const binding = path.scope.getBinding(localName);
          if (!binding) {
            continue;
          }

          // Case 1: import { a, 'a-a' as aa } from 'virtual:keywords';
          if (specifierPath.isImportSpecifier()) {
            const imported = specifierPath.node.imported;
            const keyword = t.isIdentifier(imported)
              ? imported.name
              : imported.value;
            state.keywords.add(keyword);
            const safeName = toSafeVarName(encodeIdentifier(keyword));

            for (const refPath of binding.referencePaths) {
              // Handle <a />
              if (refPath.isJSXIdentifier()) {
                refPath.replaceWith(t.jsxIdentifier(safeName));
              } else {
                refPath.replaceWith(t.identifier(safeName));
              }
            }
          }

          // Case 2: import a from 'virtual:keywords';
          else if (specifierPath.isImportDefaultSpecifier()) {
            const keyword = 'default';
            state.keywords.add(keyword);
            const safeName = toSafeVarName(encodeIdentifier(keyword));

            for (const refPath of binding.referencePaths) {
              if (refPath.isJSXIdentifier()) {
                refPath.replaceWith(t.jsxIdentifier(safeName));
              } else {
                refPath.replaceWith(t.identifier(safeName));
              }
            }
          }

          // Case 3: import * as A from 'virtual:keywords';
          else if (specifierPath.isImportNamespaceSpecifier()) {
            for (const refPath of binding.referencePaths) {
              const parentPath = refPath.parentPath;
              if (!parentPath) {
                continue;
              }

              // Case 3-1: console.log(A.a, A['a-a']);
              if (parentPath.isMemberExpression()) {
                const propertyNode = parentPath.node.property;
                let keyword: string;
                if (!parentPath.node.computed && t.isIdentifier(propertyNode)) {
                  keyword = propertyNode.name;
                } else if (
                  parentPath.node.computed &&
                  t.isStringLiteral(propertyNode)
                ) {
                  keyword = propertyNode.value;
                } else {
                  continue;
                }
                state.keywords.add(keyword);
                const safeName = toSafeVarName(encodeIdentifier(keyword));

                parentPath.replaceWith(t.identifier(safeName));
              }

              // Case 3-2: <A.a /> (<A['a-a'] /> impossible)
              else if (parentPath.isJSXMemberExpression()) {
                const keyword = parentPath.node.property.name;
                state.keywords.add(keyword);
                const safeName = toSafeVarName(encodeIdentifier(keyword));

                parentPath.replaceWith(t.jsxIdentifier(safeName));
              }

              // Case 3-3: let x: A.a;
              else if (parentPath.isTSQualifiedName()) {
                const keyword = parentPath.node.right.name;
                state.keywords.add(keyword);
                const safeName = toSafeVarName(encodeIdentifier(keyword));

                parentPath.replaceWith(t.identifier(safeName));
              }

              // Case 3-4: type T = (typeof A)['a-a'];
              else if (
                parentPath.isTSTypeQuery() &&
                parentPath.parentPath?.isTSIndexedAccessType()
              ) {
                const indexNode = parentPath.parentPath.node.indexType;
                if (
                  t.isTSLiteralType(indexNode) &&
                  t.isStringLiteral(indexNode.literal)
                ) {
                  const keyword = indexNode.literal.value;
                  state.keywords.add(keyword);
                  const safeName = toSafeVarName(encodeIdentifier(keyword));

                  parentPath.parentPath.replaceWith(
                    t.tsTypeQuery(t.identifier(safeName)),
                  );
                }
              }
            }
          }

          path.remove();
        }
      },

      ExportNamedDeclaration(path, state) {
        if (path.node.source?.value !== VIRTUAL_MODULE_ID) {
          return;
        }

        const newExports = path
          .get('specifiers')
          .map((specifierPath) => {
            // Case 4: export { a, 'a-a' as aa } from 'virtual:keywords';
            if (specifierPath.isExportSpecifier()) {
              const local = specifierPath.node.local as
                | t.Identifier
                | t.StringLiteral; // local can be StringLiteral
              const keyword = t.isIdentifier(local) ? local.name : local.value;
              state.keywords.add(keyword);
              const encoded = encodeIdentifier(keyword);
              return t.exportNamedDeclaration(
                null,
                [
                  t.exportSpecifier(
                    t.identifier('default'),
                    specifierPath.node.exported,
                  ),
                ],
                t.stringLiteral(`${VIRTUAL_MODULE_ID}/${encoded}`),
              );
            }
            return null;
          })
          .filter((node): node is t.ExportNamedDeclaration => node !== null);

        if (newExports.length > 0) {
          path.replaceWithMultiple(newExports);
        } else {
          path.remove();
        }
      },
    },
  };
};

export const transformCode = (
  code: string,
  id: string,
): {
  code: string;
  map: NonNullable<BabelFileResult['map']> | null;
  keywords: Set<string>;
} | null => {
  if (!code.includes(VIRTUAL_MODULE_ID)) {
    return null;
  }
  const result = transformSync(code, {
    babelrc: false,
    configFile: false,
    filename: id,
    sourceMaps: true,
    plugins: [transformPlugin()],
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
  });
  if (!result) {
    return null;
  }
  const metadata = result.metadata as TransformMetadata | undefined;
  const keywords = new Set(metadata?.keywords ?? []);
  return {
    code: result.code ?? '',
    map: result.map ?? null,
    keywords,
  };
};
