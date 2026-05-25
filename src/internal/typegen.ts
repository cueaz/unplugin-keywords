/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { DEBUG_SEPARATOR, HASH_LENGTH } from './constants.js';
import { encodeIdentifier, toSafeVarName } from './encode.js';

export const generateTypeDeclaration = (
  keywords: Set<string>,
  mode: 'local' | 'public' | 'raw' = 'local',
): string => {
  const sortedKeywords = Array.from(keywords).sort();
  const content = [];

  for (const keyword of sortedKeywords) {
    const encoded = encodeIdentifier(keyword);
    const safeName = toSafeVarName(encoded);
    const hash = mode === 'public' ? '*'.repeat(HASH_LENGTH) : '==';
    const value =
      mode === 'raw' ? keyword : `${hash}${DEBUG_SEPARATOR}${keyword}`;
    content.push(`declare const ${safeName}: ${JSON.stringify(value)};`);
  }
  content.push('');

  content.push('export {');
  for (const keyword of sortedKeywords) {
    const encoded = encodeIdentifier(keyword);
    const safeName = toSafeVarName(encoded);
    content.push(`  ${safeName} as ${JSON.stringify(keyword)},`);
  }
  content.push('};');
  content.push('');

  return content.join('\n');
};
