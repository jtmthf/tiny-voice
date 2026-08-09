const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function parseBracketNotation(formData: FormData): Record<string, unknown> {
  const root: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of formData.entries()) {
    setPath(root, parsePath(key), value);
  }
  return root;
}

function parsePath(key: string): (string | number)[] {
  const parts = key.split(/[\[\]]/).filter(Boolean);
  if (parts.some((p) => FORBIDDEN_KEYS.has(p))) {
    throw new Error(`Unsafe key in form data: ${key}`);
  }
  return parts.map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

function setPath(obj: Record<string, unknown>, path: (string | number)[], value: unknown): void {
  let cur: Record<string, unknown> | unknown[] = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const nextKey = path[i + 1];
    if (key === undefined || nextKey === undefined) break;
    const curAsObj = cur as Record<string, unknown>;
    if (curAsObj[key as string] == null) {
      curAsObj[key as string] =
        typeof nextKey === 'number' ? [] : (Object.create(null) as Record<string, unknown>);
    }
    cur = curAsObj[key as string] as Record<string, unknown> | unknown[];
  }
  const lastKey = path[path.length - 1];
  if (lastKey !== undefined) {
    (cur as Record<string, unknown>)[lastKey as string] = value;
  }
}
