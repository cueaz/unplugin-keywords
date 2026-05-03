import { type ParseResult, parseSync, types as t, traverse } from '@babel/core';
import { VIRTUAL_MODULE_ID } from './constants';

export const extractKeywords = (code: string): Set<string> | null => {
  const keywords = new Set<string>();

  if (!code.includes(VIRTUAL_MODULE_ID)) {
    return null;
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
    return null;
  }
  if (!ast) {
    return null;
  }

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value !== VIRTUAL_MODULE_ID) return;

      for (const specifierPath of path.get('specifiers')) {
        if (specifierPath.isImportSpecifier()) {
          const imported = specifierPath.node.imported;
          keywords.add(
            t.isIdentifier(imported) ? imported.name : imported.value,
          );
        } else if (specifierPath.isImportDefaultSpecifier()) {
          keywords.add('default');
        }
        // We don't need to add anything for Namespace imports here,
        // because their usages are caught by the Identifier visitor below.
      }
    },

    ExportNamedDeclaration(path) {
      if (path.node.source?.value !== VIRTUAL_MODULE_ID) return;

      path.get('specifiers').forEach((specifierPath) => {
        if (specifierPath.isExportSpecifier()) {
          const local = specifierPath.node.local as
            | t.Identifier
            | t.StringLiteral;
          keywords.add(t.isIdentifier(local) ? local.name : local.value);
        }
      });
    },

    Identifier(path) {
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

      if (bindingPath.isImportNamespaceSpecifier()) {
        const parentPath = path.parentPath;
        if (!parentPath) return;

        if (
          parentPath.isMemberExpression() &&
          parentPath.node.object === path.node
        ) {
          const propertyNode = parentPath.node.property;
          if (!parentPath.node.computed && t.isIdentifier(propertyNode)) {
            keywords.add(propertyNode.name);
          } else if (
            parentPath.node.computed &&
            t.isStringLiteral(propertyNode)
          ) {
            keywords.add(propertyNode.value);
          }
        } else if (
          parentPath.isTSQualifiedName() &&
          parentPath.node.left === path.node
        ) {
          keywords.add(parentPath.node.right.name);
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
              keywords.add(indexNode.literal.value);
            }
          }
        }
      }
    },

    JSXIdentifier(path) {
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

      if (bindingPath.isImportNamespaceSpecifier()) {
        const parentPath = path.parentPath;
        if (!parentPath) return;

        if (
          parentPath.isJSXMemberExpression() &&
          parentPath.node.object === path.node
        ) {
          keywords.add(parentPath.node.property.name);
        }
      }
    },
  });

  return keywords;
};
