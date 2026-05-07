import { DEBUG_SEPARATOR, MAX_HASH_LENGTH } from './constants.js';
import { encodeIdentifier, toSafeVarName } from './encode.js';

export const generateTypeDeclaration = (keywords: Set<string>): string => {
  const sortedKeywords = Array.from(keywords).sort();
  const content = [];
  // content.push(
  //   'type Keyword<K extends string, V extends string> = V & { readonly __keyword__: K };',
  // );
  // content.push('');

  for (const keyword of sortedKeywords) {
    const encoded = encodeIdentifier(keyword);
    const safeName = toSafeVarName(encoded);
    const hash = '*'.repeat(MAX_HASH_LENGTH);
    const value = `${hash}${DEBUG_SEPARATOR}${keyword}`;
    // content.push(
    //   `declare const ${safeName}: Keyword<${JSON.stringify(keyword)}, ${JSON.stringify(value)}>;`,
    // );
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
