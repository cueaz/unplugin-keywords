/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import { createHmac, hkdfSync } from 'node:crypto';
import blacklist from 'virtual:blacklist';
import {
  HASH_LENGTH,
  VIRTUAL_MODULE_ID,
  VIRTUAL_PUBLIC_MODULE_ID,
} from './constants.js';

const ALPHA_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE62_CHARS = `${ALPHA_CHARS}0123456789`;

const ALPHA_LEN = BigInt(ALPHA_CHARS.length); // 52n
const BASE62_LEN = BigInt(BASE62_CHARS.length); // 62n

export type Hasher = (input: string) => string;

// Format: [1 Alpha] + [N Base62]
export const createHasher = (secret: string): Hasher => {
  const base62TailLength = HASH_LENGTH - 1;
  if (base62TailLength < 0 || base62TailLength > 9) {
    // 52 * 62^9 < 2^64 < 52 * 62^10
    throw new Error('Invalid MAX_HASH_LENGTH');
  }

  const cache = new Map<string, string>();
  return (input) => {
    if (cache.has(input)) {
      return cache.get(input) as string;
    }

    const info = VIRTUAL_PUBLIC_MODULE_ID;
    let retry = 0;
    let result: string;

    do {
      const r = retry.toString();
      const payload = `${info.length}:${info}|${input.length}:${input}|${r.length}:${r}`;
      const hasher = createHmac('sha256', secret);
      const buffer = hasher.update(payload).digest('hex');

      let entropy = BigInt(`0x${buffer}`);
      result = '';

      result += ALPHA_CHARS[Number(entropy % ALPHA_LEN)];
      entropy /= ALPHA_LEN;
      for (let i = 0; i < base62TailLength; i++) {
        result += BASE62_CHARS[Number(entropy % BASE62_LEN)];
        entropy /= BASE62_LEN;
      }

      retry++;
    } while (blacklist.has(result));

    cache.set(input, result);
    return result;
  };
};

// Fisher-Yates based deterministic shuffle
const shuffle = (str: string, secret: string, salt: string): string => {
  const arr = Array.from(str);
  const requiredBytes = (arr.length - 1) * 4;

  const info = VIRTUAL_MODULE_ID;
  const keyingMaterial = hkdfSync('sha256', secret, salt, info, requiredBytes);
  const prngBuffer = Buffer.from(keyingMaterial);

  let byteOffset = 0;
  for (let i = arr.length - 1; i > 0; i--) {
    const random32 = prngBuffer.readUInt32BE(byteOffset);
    byteOffset += 4;
    const j = random32 % (i + 1);
    const temp = arr[i] as string;
    arr[i] = arr[j] as string;
    arr[j] = temp;
  }

  return arr.join('');
};

export const createCounter = (secret: string): Hasher => {
  const shuffledAlpha = shuffle(ALPHA_CHARS, secret, 'alpha');
  const shuffledBase62 = shuffle(BASE62_CHARS, secret, 'base62');

  let index = 0;
  const cache = new Map<string, string>();
  return (input) => {
    if (cache.has(input)) {
      return cache.get(input) as string;
    }

    let result: string;
    do {
      result = '';
      let current = index;
      index++;

      result += shuffledAlpha[current % shuffledAlpha.length];
      current = Math.floor(current / shuffledAlpha.length);
      while (current > 0) {
        current--;
        result += shuffledBase62[current % shuffledBase62.length];
        current = Math.floor(current / shuffledBase62.length);
      }
    } while (blacklist.has(result));

    cache.set(input, result);
    return result;
  };
};
