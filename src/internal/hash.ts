import { createHmac } from 'node:crypto';
import { HASH_LENGTH } from './constants.js';

const ALPHA_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT_CHARS = '0123456789';
const BASE62_CHARS = ALPHA_CHARS + DIGIT_CHARS;

const ALPHA_LEN = BigInt(ALPHA_CHARS.length); // 52n
const DIGIT_LEN = BigInt(DIGIT_CHARS.length); // 10n
const BASE62_LEN = BigInt(BASE62_CHARS.length); // 62n

export type Hasher = (input: string) => string;

// Format: [1 Alpha] + [1 Digit] + [N Base62]
// Avoids any collisions with standard JS API identifiers
export const createHasher = (secret: string): Hasher => {
  const base62TailLength = HASH_LENGTH - 2;
  if (base62TailLength < 0 || base62TailLength > 9) {
    // 520 * 62^9 < 2^64 < 520 * 62^10
    throw new Error('Invalid MAX_HASH_LENGTH');
  }

  const cache = new Map<string, string>();
  return (input) => {
    if (cache.has(input)) {
      return cache.get(input) as string;
    }

    const hasher = createHmac('sha256', secret);
    const buffer = hasher.update(input).digest();

    let entropy = buffer.readBigUInt64BE(0);
    let result = '';

    result += ALPHA_CHARS[Number(entropy % ALPHA_LEN)];
    entropy /= ALPHA_LEN;
    result += DIGIT_CHARS[Number(entropy % DIGIT_LEN)];
    entropy /= DIGIT_LEN;
    for (let i = 0; i < base62TailLength; i++) {
      result += BASE62_CHARS[Number(entropy % BASE62_LEN)];
      entropy /= BASE62_LEN;
    }

    cache.set(input, result);
    return result;
  };
};

export const createCounter = (): Hasher => {
  let index = 0;
  return () => {
    let result = '_';
    result += ALPHA_CHARS[index % ALPHA_CHARS.length];
    let remain = Math.floor(index / ALPHA_CHARS.length);
    while (remain > 0) {
      remain--;
      result += BASE62_CHARS[remain % BASE62_CHARS.length];
      remain = Math.floor(remain / BASE62_CHARS.length);
    }
    index++;
    return result;
  };
};
