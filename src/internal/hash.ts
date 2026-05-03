import type { XXHashAPI } from 'xxhash-wasm';
import { SHORT_HASH_LENGTH } from './constants';

const ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ALPHABET_SIZE = BigInt(ALPHABET.length);
const EXPONENT = BigInt(SHORT_HASH_LENGTH);

const toBaseN = (num: bigint): string => {
  let n = num;
  let res = '';
  while (n > 0n) {
    res = ALPHABET[Number(n % ALPHABET_SIZE)] + res;
    n = n / ALPHABET_SIZE;
  }
  return res;
};

export const toShortHash = (
  xxhash: XXHashAPI,
  input: string,
  seed: number,
): string => {
  const hash = xxhash.h64(input, BigInt(seed));
  const baseN = toBaseN(hash % ALPHABET_SIZE ** EXPONENT);
  return baseN.padStart(SHORT_HASH_LENGTH, ALPHABET[0]);
};
