import { type ParseResult, parseSync, types as t, traverse } from '@babel/core';
import { VIRTUAL_MODULE_ID } from './constants';

export const extractKeywords = (code: string): Set<string> => {
  const keywords = new Set<string>();

  if (!code.includes(VIRTUAL_MODULE_ID)) {
    return keywords;
  }

  let ast: ParseResult | null;
  try {
    ast = parseSync(code, {
      babelrc: false,
      configFile: false,
      sourceType: 'module',
      parserOpts: {
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
      },
    });
  } catch (_) {
    return keywords;
  }
  if (!ast) {
    return keywords;
  }

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value !== VIRTUAL_MODULE_ID) {
        return;
      }

      for (const specifierPath of path.get('specifiers')) {
        // Case 1: import { a, 'a-a' as aa } from 'virtual:keywords';
        if (specifierPath.isImportSpecifier()) {
          const imported = specifierPath.node.imported;
          if (t.isIdentifier(imported)) {
            keywords.add(imported.name);
          } else {
            keywords.add(imported.value);
          }
        }

        // Case 2: import a from 'virtual:keywords';
        else if (specifierPath.isImportDefaultSpecifier()) {
          keywords.add('default');
        }

        // Case 3: import * as A from 'virtual:keywords';
        else if (specifierPath.isImportNamespaceSpecifier()) {
          const localName = specifierPath.node.local.name;
          const binding = path.scope.getBinding(localName);
          if (!binding) {
            continue;
          }

          for (const refPath of binding.referencePaths) {
            const parentPath = refPath.parentPath;
            if (!parentPath) {
              continue;
            }

            // Case 3-1: console.log(A.a, A['a-a']);
            if (parentPath.isMemberExpression()) {
              const propertyNode = parentPath.node.property;
              if (!parentPath.node.computed && t.isIdentifier(propertyNode)) {
                keywords.add(propertyNode.name);
              } else if (
                parentPath.node.computed &&
                t.isStringLiteral(propertyNode)
              ) {
                keywords.add(propertyNode.value);
              }
            }

            // Case 3-2: <A.a /> (<A['a-a'] /> impossible)
            else if (parentPath.isJSXMemberExpression()) {
              keywords.add(parentPath.node.property.name);
            }

            // Case 3-3: let x: A.a;
            else if (parentPath.isTSQualifiedName()) {
              keywords.add(parentPath.node.right.name);
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
                keywords.add(indexNode.literal.value);
              }
            }
          }
        }
      }
    },

    ExportNamedDeclaration(path) {
      if (path.node.source?.value !== VIRTUAL_MODULE_ID) {
        return;
      }

      path.get('specifiers').forEach((specifierPath) => {
        // Case 4: export { a, 'a-a' as aa } from 'virtual:keywords';
        if (specifierPath.isExportSpecifier()) {
          const local = specifierPath.node.local as
            | t.Identifier
            | t.StringLiteral; // local can be StringLiteral
          if (t.isIdentifier(local)) {
            keywords.add(local.name);
          } else {
            keywords.add(local.value);
          }
        }
      });
    },
  });

  return keywords;
};
