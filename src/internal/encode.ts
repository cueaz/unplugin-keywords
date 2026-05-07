declare const __encoded__: unique symbol;
type Encoded = string & { [__encoded__]: never };

export const encodeIdentifier = (identifier: string): Encoded => {
  let encoded = '';
  for (let i = 0; i < identifier.length; i++) {
    const c = identifier[i] as string;
    if (/[a-zA-Z0-9_]/.test(c)) {
      encoded += c;
    } else if (c === '$') {
      encoded += '$$';
    } else {
      encoded += `$${c.charCodeAt(0).toString(16).padStart(4, '0')}`;
    }
  }
  return encoded as Encoded;
};

export const toSafeVarName = (encoded: Encoded): string => `_$${encoded}`;
