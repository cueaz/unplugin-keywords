export const resolveId = (id: string): string => `\0${id}`;

export const splitQuery = (id: string): [string, string | undefined] => {
  const index = id.indexOf('?');
  if (index === -1) {
    return [id, undefined];
  }
  return [id.slice(0, index), id.slice(index + 1)];
};

export const toIncludes = (id: string): RegExp[] => [new RegExp(`^${id}/`)];

export const COMMON_EXCLUDES = [/\/node_modules\//];
