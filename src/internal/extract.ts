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

      path.get('specifiers').forEach((specifierPath) => {
        // Case 1: import { a } from 'virtual:keywords';
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
            return;
          }

          binding.referencePaths.forEach((ref) => {
            const parentPath = ref.parentPath;
            if (!parentPath) {
              return;
            }

            // console.log(A.prop)
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

            // let x: A.prop
            else if (parentPath.isTSQualifiedName()) {
              const propertyNode = parentPath.node.right;
              keywords.add(propertyNode.name);
            }
          });
        }
      });
    },
  });

  return keywords;
};
