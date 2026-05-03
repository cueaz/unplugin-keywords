export const encodeIdentifier = (identifier: string): string => {
  let encoded = '';
  for (let i = 0; i < identifier.length; i++) {
    const c = identifier[i];
    if (/[a-zA-Z0-9_]/.test(c)) {
      encoded += c;
    } else if (c === '$') {
      encoded += '$$';
    } else {
      encoded += `$${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
    }
  }
  return encoded;
};

export const toSafeVarName = (encoded: string): string => `_$${encoded}`;
