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
  keywordUids: Map<string, t.Identifier>;
  allKeywords: Set<string>;
}

interface TransformMetadata {
  keywords?: string[];
}

const getUid = (
  state: TransformState,
  path: import('@babel/core').NodePath,
  keyword: string,
) => {
  state.allKeywords.add(keyword);
  let uid = state.keywordUids.get(keyword);
  if (!uid) {
    const safeName = toSafeVarName(encodeIdentifier(keyword));
    const programScope = path.scope.getProgramParent();
    uid = programScope.generateUidIdentifier(safeName);
    state.keywordUids.set(keyword, uid);
  }
  return t.cloneNode(uid);
};

const transformPlugin = (): PluginObj<TransformState> => {
  return {
    name: `${PLUGIN_NAME}:transform`,
    visitor: {
      Program: {
        enter(_, state) {
          state.keywordUids = new Map();
          state.allKeywords = new Set();
        },
        exit(path, state) {
          const metadata = state.file.metadata as TransformMetadata;
          metadata.keywords = Array.from(state.allKeywords);

          const newImports = Array.from(state.keywordUids.entries()).map(
            ([keyword, safeId]) => {
              const encoded = encodeIdentifier(keyword);
              return t.importDeclaration(
                [t.importDefaultSpecifier(safeId)],
                t.stringLiteral(`${VIRTUAL_MODULE_ID}/${encoded}`),
              );
            },
          );
          if (newImports.length > 0) {
            path.unshiftContainer('body', newImports);
          }

          path.traverse({
            ImportDeclaration(importPath) {
              if (importPath.node.source.value === VIRTUAL_MODULE_ID) {
                importPath.remove();
              }
            },
          });
        },
      },

      ExportNamedDeclaration(path, state) {
        if (path.node.source?.value !== VIRTUAL_MODULE_ID) return;

        const newExports = path
          .get('specifiers')
          .map((specifierPath) => {
            if (specifierPath.isExportSpecifier()) {
              const local = specifierPath.node.local as
                | t.Identifier
                | t.StringLiteral;
              const keyword = t.isIdentifier(local) ? local.name : local.value;
              state.allKeywords.add(keyword);
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

      Identifier(path, state) {
        if (
          path.parentPath?.isImportSpecifier() ||
          path.parentPath?.isImportDefaultSpecifier() ||
          path.parentPath?.isImportNamespaceSpecifier() ||
          path.parentPath?.isExportSpecifier()
        ) {
          return;
        }

        const binding = path.scope.getBinding(path.node.name);
        if (!binding) return;
        const bindingPath = binding.path;
        if (
          !bindingPath.parentPath?.isImportDeclaration() ||
          bindingPath.parentPath.node.source.value !== VIRTUAL_MODULE_ID
        ) {
          return;
        }

        if (
          bindingPath.isImportSpecifier() ||
          bindingPath.isImportDefaultSpecifier()
        ) {
          let keyword: string;
          if (bindingPath.isImportDefaultSpecifier()) {
            keyword = 'default';
          } else {
            const imported = (bindingPath.node as t.ImportSpecifier).imported;
            keyword = t.isIdentifier(imported) ? imported.name : imported.value;
          }

          path.replaceWith(getUid(state, path, keyword));
        } else if (bindingPath.isImportNamespaceSpecifier()) {
          const parentPath = path.parentPath;
          if (!parentPath) return;

          if (
            parentPath.isMemberExpression() &&
            parentPath.node.object === path.node
          ) {
            const propertyNode = parentPath.node.property;
            if (!parentPath.node.computed && t.isIdentifier(propertyNode)) {
              const keyword = propertyNode.name;
              parentPath.replaceWith(getUid(state, path, keyword));
            } else if (
              parentPath.node.computed &&
              t.isStringLiteral(propertyNode)
            ) {
              const keyword = propertyNode.value;
              parentPath.replaceWith(getUid(state, path, keyword));
            }
          } else if (
            parentPath.isTSQualifiedName() &&
            parentPath.node.left === path.node
          ) {
            const keyword = parentPath.node.right.name;
            parentPath.replaceWith(getUid(state, path, keyword));
          } else if (
            parentPath.isTSTypeQuery() &&
            parentPath.node.exprName === path.node
          ) {
            let current: import('@babel/core').NodePath = parentPath;
            while (current.parentPath?.isTSParenthesizedType()) {
              current = current.parentPath;
            }
            const parentParent = current.parentPath;
            if (
              parentParent?.isTSIndexedAccessType() &&
              parentParent.node.objectType === current.node
            ) {
              const indexNode = parentParent.node.indexType;
              if (
                t.isTSLiteralType(indexNode) &&
                t.isStringLiteral(indexNode.literal)
              ) {
                const keyword = indexNode.literal.value;
                parentParent.replaceWith(
                  t.tsTypeQuery(getUid(state, path, keyword)),
                );
              }
            }
          }
        }
      },

      JSXIdentifier(path, state) {
        if (
          path.parentPath?.isImportSpecifier() ||
          path.parentPath?.isImportDefaultSpecifier() ||
          path.parentPath?.isImportNamespaceSpecifier() ||
          path.parentPath?.isExportSpecifier()
        ) {
          return;
        }

        const binding = path.scope.getBinding(path.node.name);
        if (!binding) return;
        const bindingPath = binding.path;
        if (
          !bindingPath.parentPath?.isImportDeclaration() ||
          bindingPath.parentPath.node.source.value !== VIRTUAL_MODULE_ID
        ) {
          return;
        }

        if (
          bindingPath.isImportSpecifier() ||
          bindingPath.isImportDefaultSpecifier()
        ) {
          if (
            path.parentPath?.isJSXOpeningElement() ||
            path.parentPath?.isJSXClosingElement()
          ) {
            let keyword: string;
            if (bindingPath.isImportDefaultSpecifier()) {
              keyword = 'default';
            } else {
              const imported = (bindingPath.node as t.ImportSpecifier).imported;
              keyword = t.isIdentifier(imported)
                ? imported.name
                : imported.value;
            }

            path.replaceWith(
              t.jsxIdentifier(getUid(state, path, keyword).name),
            );
          }
        } else if (bindingPath.isImportNamespaceSpecifier()) {
          const parentPath = path.parentPath;
          if (!parentPath) return;

          if (
            parentPath.isJSXMemberExpression() &&
            parentPath.node.object === path.node
          ) {
            const keyword = parentPath.node.property.name;
            parentPath.replaceWith(
              t.jsxIdentifier(getUid(state, path, keyword).name),
            );
          }
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
