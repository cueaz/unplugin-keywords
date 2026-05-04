import { createHmac } from 'node:crypto';
import { MAX_HASH_LENGTH } from './constants';

const BASE62_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const BASE62_LENGTH = BASE62_CHARS.length;
const SPACE_SIZE = BASE62_LENGTH ** MAX_HASH_LENGTH; // 62^7 << 2^52

const toBase62 = (num: number): string => {
  let n = num;
  let res = '';
  while (n > 0) {
    res = BASE62_CHARS[n % BASE62_LENGTH] + res;
    n = Math.floor(n / BASE62_LENGTH);
  }
  return res;
};

export type Hasher = (input: string) => string;

export const createHasher = (secret: string): Hasher => {
  const cache = new Map<string, string>();
  return (input) => {
    if (cache.has(input)) {
      return cache.get(input) as string;
    }
    const hasher = createHmac('sha256', secret);
    const buffer = hasher.update(input).digest();
    const hash = buffer.readBigUInt64BE(0);
    const value = toBase62(Number(hash % (BigInt(SPACE_SIZE) - 1n)) + 1);
    cache.set(input, value);
    return value;
  };
};
