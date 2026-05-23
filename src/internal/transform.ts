/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import {
  type FileResult,
  type NodePath,
  type PluginItem,
  type PluginObject,
  type PluginPass,
  types as t,
  transformSync,
} from '@babel/core';
import {
  KEYWORD_ROUTE,
  PLUGIN_NAME,
  VIRTUAL_INTERNAL_MODULE_ID,
  VIRTUAL_INTERNAL_PUBLIC_MODULE_ID,
  VIRTUAL_MODULE_ID,
  VIRTUAL_PUBLIC_MODULE_ID,
} from './constants.js';
import { encodeIdentifier, toSafeVarName } from './encode.js';

export interface KeywordSet {
  local: Set<string>;
  public: Set<string>;
}

const isPureTypeSpace = (path: NodePath): boolean => {
  let current: NodePath | null = path;
  while (current) {
    const parent = current.parentPath;
    if (!parent) {
      break;
    }
    // 1. Value crossings via `typeof`
    if (parent.isTSTypeQuery()) {
      return false;
    }
    // 2. Computed keys (e.g., interface I { [Abc]: string })
    if ('computed' in parent.node && parent.node.computed) {
      if (current.key === 'key' || current.key === 'property') {
        return false;
      }
    }
    // 3-A. Definitive Type Contexts
    if (
      parent.isTSType() ||
      parent.isTSTypeParameterDeclaration() ||
      parent.isTSTypeParameterInstantiation() ||
      parent.isTSClassImplements() ||
      parent.isTSInterfaceHeritage()
    ) {
      return true;
    }
    // 3-B. Type Declaration Identifiers (e.g., interface Abc {}, type Abc = {})
    if (
      parent.isTSInterfaceDeclaration() ||
      parent.isTSTypeAliasDeclaration() ||
      parent.isTSEnumDeclaration() ||
      parent.isTSModuleDeclaration()
    ) {
      if (current.key === 'id') {
        return true;
      }
    }
    // 4. Continue up structural TS nodes (A.B.C)
    if (parent.isTSQualifiedName() || parent.isTSEntityName()) {
      current = current.parentPath;
      continue;
    }
    // 5. If we reach standard JS statements/expressions, it implies Value Space.
    if (parent.isExpression() || parent.isStatement()) {
      break;
    }
    current = current.parentPath;
  }
  return false;
};

interface TransformState extends PluginPass {
  keywords: KeywordSet;
  keywordUids: {
    local: Map<string, t.Identifier>;
    public: Map<string, t.Identifier>;
  };
}

interface TransformMetadata {
  keywords?: { local: string[]; public: string[] };
}

const transformPlugin = (mode: 'extract' | 'transform'): PluginItem => {
  const plugin: PluginObject<TransformState> = {
    name: `${PLUGIN_NAME}:${mode}`,

    visitor: {
      Program: {
        enter(_, state) {
          state.keywords = { local: new Set(), public: new Set() };
          state.keywordUids = { local: new Map(), public: new Map() };
        },

        exit(path, state) {
          const metadata = state.file.metadata as TransformMetadata;
          metadata.keywords = {
            local: Array.from(state.keywords.local),
            public: Array.from(state.keywords.public),
          };

          if (mode === 'transform') {
            const newImports = [];
            for (const [keyword, safeId] of state.keywordUids.local.entries()) {
              const encoded = encodeIdentifier(keyword);
              newImports.push(
                t.importDeclaration(
                  [t.importDefaultSpecifier(safeId)],
                  t.stringLiteral(
                    `${VIRTUAL_INTERNAL_MODULE_ID}/${KEYWORD_ROUTE}/${encoded}`,
                  ),
                ),
              );
            }
            for (const [
              keyword,
              safeId,
            ] of state.keywordUids.public.entries()) {
              const encoded = encodeIdentifier(keyword);
              newImports.push(
                t.importDeclaration(
                  [t.importDefaultSpecifier(safeId)],
                  t.stringLiteral(
                    `${VIRTUAL_INTERNAL_PUBLIC_MODULE_ID}/${KEYWORD_ROUTE}/${encoded}`,
                  ),
                ),
              );
            }
            if (newImports.length > 0) {
              path.unshiftContainer('body', newImports);
            }
          }
        },
      },

      ImportDeclaration(path, state) {
        const sourceValue = path.node.source.value;
        if (
          sourceValue !== VIRTUAL_MODULE_ID &&
          sourceValue !== VIRTUAL_PUBLIC_MODULE_ID
        ) {
          return;
        }
        const isPublic = sourceValue === VIRTUAL_PUBLIC_MODULE_ID;
        const targetSet = isPublic
          ? state.keywords.public
          : state.keywords.local;
        const targetMap = isPublic
          ? state.keywordUids.public
          : state.keywordUids.local;

        const programScope = path.scope.getProgramParent();
        const processKeyword = (keyword: string): t.Identifier | null => {
          targetSet.add(keyword);
          if (mode === 'extract') {
            return null;
          }
          if (targetMap.has(keyword)) {
            return targetMap.get(keyword) as t.Identifier;
          }
          const encoded = encodeIdentifier(keyword);
          const safeName = toSafeVarName(encoded);
          const uid = programScope.generateUidIdentifier(safeName);
          targetMap.set(keyword, uid);
          return uid;
        };

        for (const specifierPath of path.get('specifiers')) {
          const localName = specifierPath.node.local.name;
          const binding = path.scope.getBinding(localName);
          if (!binding) {
            continue;
          }

          // Case A: Default & Named Imports
          if (
            specifierPath.isImportDefaultSpecifier() ||
            specifierPath.isImportSpecifier()
          ) {
            let keyword: string;
            if (specifierPath.isImportDefaultSpecifier()) {
              keyword = 'default';
            } else {
              const imported = specifierPath.node.imported;
              keyword = t.isIdentifier(imported)
                ? imported.name
                : imported.value;
            }
            const uidNode = processKeyword(keyword);
            if (!uidNode) {
              continue;
            }

            // 1) Fast Path: Values & JSX
            for (const refPath of binding.referencePaths) {
              if (isPureTypeSpace(refPath)) {
                continue;
              }
              if (refPath.isJSXIdentifier()) {
                refPath.replaceWith(t.jsxIdentifier(uidNode.name));
              } else {
                refPath.replaceWith(t.cloneNode(uidNode));
              }
            }

            // 2) Slow Path: TS Types
            // NOTE: Can be skipped due to type erasure, but for consistency
            path.parentPath.traverse({
              // e.g., type T = typeof abc;
              TSTypeQuery(tsPath) {
                if (
                  t.isIdentifier(tsPath.node.exprName) &&
                  tsPath.node.exprName.name === localName &&
                  tsPath.scope.getBinding(localName) === binding
                ) {
                  tsPath.get('exprName').replaceWith(t.cloneNode(uidNode));
                }
              },
            });
          }

          // Case B: Namespace Imports
          else if (specifierPath.isImportNamespaceSpecifier()) {
            // 1) Fast Path: JS Values & JSX accesses
            for (const refPath of binding.referencePaths) {
              if (isPureTypeSpace(refPath)) {
                continue;
              }
              const parentPath = refPath.parentPath;
              if (!parentPath) {
                continue;
              }
              if (
                parentPath.isMemberExpression() &&
                parentPath.node.object === refPath.node
              ) {
                const propNode = parentPath.node.property;
                let keyword: string | undefined;
                if (!parentPath.node.computed && t.isIdentifier(propNode)) {
                  keyword = propNode.name;
                } else if (
                  parentPath.node.computed &&
                  t.isStringLiteral(propNode)
                ) {
                  keyword = propNode.value;
                }
                if (keyword) {
                  const uidNode = processKeyword(keyword);
                  if (uidNode) {
                    parentPath.replaceWith(t.cloneNode(uidNode));
                  }
                }
              } else if (
                parentPath.isJSXMemberExpression() &&
                parentPath.node.object === refPath.node
              ) {
                const keyword = parentPath.node.property.name;
                const uidNode = processKeyword(keyword);
                if (uidNode) {
                  parentPath.replaceWith(t.jsxIdentifier(uidNode.name));
                }
              }
            }

            // 2) Slow Path: TS Namespace Types
            path.parentPath.traverse({
              // e.g., type T = typeof A.abc;
              TSTypeQuery(tsPath) {
                const expr = tsPath.node.exprName;
                if (
                  t.isTSQualifiedName(expr) &&
                  t.isIdentifier(expr.left) &&
                  expr.left.name === localName &&
                  tsPath.scope.getBinding(localName) === binding
                ) {
                  const keyword = expr.right.name;
                  const uidNode = processKeyword(keyword);
                  if (uidNode) {
                    tsPath.get('exprName').replaceWith(t.cloneNode(uidNode));
                  }
                }
              },

              // e.g., type T = ((typeof A))['prop'];
              TSIndexedAccessType(tsPath) {
                const objPath = tsPath.get('objectType') as NodePath;
                if (
                  objPath.isTSTypeQuery() &&
                  t.isIdentifier(objPath.node.exprName) &&
                  objPath.node.exprName.name === localName &&
                  tsPath.scope.getBinding(localName) === binding
                ) {
                  const indexNode = tsPath.node.indexType;
                  if (
                    t.isTSLiteralType(indexNode) &&
                    t.isStringLiteral(indexNode.literal)
                  ) {
                    const keyword = indexNode.literal.value;
                    const uidNode = processKeyword(keyword);
                    if (uidNode) {
                      tsPath.replaceWith(t.tsTypeQuery(t.cloneNode(uidNode)));
                    }
                  }
                }
              },
            });
          }
        }

        if (mode === 'transform') {
          path.remove();
        }
      },

      ExportNamedDeclaration(path, state) {
        const sourceValue = path.node.source?.value;
        if (
          sourceValue !== VIRTUAL_MODULE_ID &&
          sourceValue !== VIRTUAL_PUBLIC_MODULE_ID
        ) {
          return;
        }
        const isPublic = sourceValue === VIRTUAL_PUBLIC_MODULE_ID;
        const targetSet = isPublic
          ? state.keywords.public
          : state.keywords.local;

        if (mode === 'extract') {
          for (const specifierPath of path.get('specifiers')) {
            if (specifierPath.isExportSpecifier()) {
              const local = specifierPath.node.local as
                | t.Identifier
                | t.StringLiteral; // local can be a StringLiteral in ES2022
              const keyword = t.isIdentifier(local) ? local.name : local.value;
              targetSet.add(keyword);
            }
          }
          return;
        }

        const newExports = path
          .get('specifiers')
          .map((specifierPath) => {
            if (specifierPath.isExportSpecifier()) {
              const local = specifierPath.node.local as
                | t.Identifier
                | t.StringLiteral; // local can be a StringLiteral in ES2022
              const keyword = t.isIdentifier(local) ? local.name : local.value;
              targetSet.add(keyword);
              const encoded = encodeIdentifier(keyword);
              const targetModuleId = isPublic
                ? VIRTUAL_INTERNAL_PUBLIC_MODULE_ID
                : VIRTUAL_INTERNAL_MODULE_ID;
              return t.exportNamedDeclaration(
                null,
                [
                  t.exportSpecifier(
                    t.identifier('default'),
                    specifierPath.node.exported,
                  ),
                ],
                t.stringLiteral(
                  `${targetModuleId}/${KEYWORD_ROUTE}/${encoded}`,
                ),
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

  return () => plugin as PluginObject;
};

export const transformCode = (
  code: string,
  id: string,
): {
  code: string;
  map: NonNullable<FileResult['map']> | null;
  keywords: KeywordSet;
} | null => {
  if (
    !code.includes(VIRTUAL_MODULE_ID) &&
    !code.includes(VIRTUAL_PUBLIC_MODULE_ID)
  ) {
    return null;
  }
  const result = transformSync(code, {
    babelrc: false,
    configFile: false,
    filename: id,
    sourceMaps: true,
    ast: false,
    plugins: [transformPlugin('transform')],
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
  });
  if (!result) {
    return null;
  }
  const metadata = result.metadata as TransformMetadata | undefined;
  const keywords: KeywordSet = {
    local: new Set(metadata?.keywords?.local ?? []),
    public: new Set(metadata?.keywords?.public ?? []),
  };
  return {
    code: result.code ?? '',
    map: result.map ?? null,
    keywords,
  };
};

export const extractKeywords = (code: string): KeywordSet | null => {
  if (
    !code.includes(VIRTUAL_MODULE_ID) &&
    !code.includes(VIRTUAL_PUBLIC_MODULE_ID)
  ) {
    return null;
  }
  let result: FileResult | null;
  try {
    result = transformSync(code, {
      babelrc: false,
      configFile: false,
      sourceMaps: false,
      ast: false,
      code: false,
      plugins: [transformPlugin('extract')],
      parserOpts: {
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
      },
    });
  } catch {
    return null;
  }
  if (!result) {
    return null;
  }
  const metadata = result.metadata as TransformMetadata | undefined;
  return {
    local: new Set(metadata?.keywords?.local ?? []),
    public: new Set(metadata?.keywords?.public ?? []),
  };
};
