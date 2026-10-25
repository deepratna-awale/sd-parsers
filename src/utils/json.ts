/**
 * JSON helpers that mirror the behaviour of Python's `json.loads`.
 */

const NON_FINITE: Record<string, number> = {
  NaN: NaN,
  Infinity: Infinity,
  '-Infinity': -Infinity,
};

/**
 * Replace the bare `NaN`, `Infinity` and `-Infinity` tokens that Python's json module
 * accepts (and ComfyUI sometimes writes) with sentinel strings.
 */
function escapeNonFinite(text: string, sentinel: string): string {
  let result = '';
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      result += char;
      if (char === '\\') {
        result += text[++i] ?? '';
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    const token = ['-Infinity', 'Infinity', 'NaN'].find(t => text.startsWith(t, i));
    if (token) {
      result += JSON.stringify(sentinel + token);
      i += token.length - 1;
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * Parse a JSON string the way Python's `json.loads` does,
 * additionally accepting `NaN`, `Infinity` and `-Infinity`.
 */
export function loadJson(text: unknown): any {
  if (text instanceof Uint8Array) {
    text = new TextDecoder().decode(text);
  }
  if (typeof text !== 'string') {
    throw new TypeError(`the JSON object must be str or bytes, not ${typeof text}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const sentinel = `\u0000sd-parsers:${Math.random().toString(36).slice(2)}:`;
    const escaped = escapeNonFinite(text, sentinel);
    if (escaped === text) {
      throw error;
    }

    return JSON.parse(escaped, (_key, value) =>
      typeof value === 'string' && value.startsWith(sentinel)
        ? NON_FINITE[value.slice(sentinel.length)]
        : value
    );
  }
}

/**
 * Parse a JSON object and return its top-level entries in document order.
 *
 * Plain JavaScript objects move integer-like keys to the front, which would change
 * the order in which e.g. ComfyUI nodes are processed compared to Python dicts.
 */
export function loadJsonEntries(text: string): [string, any][] {
  const value = loadJson(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('JSON value is not an object');
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  let depth = 0;
  let expectKey = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      // find the end of the string literal
      let end = i + 1;
      while (end < text.length && text[end] !== '"') {
        end += text[end] === '\\' ? 2 : 1;
      }

      if (depth === 1 && expectKey) {
        const key = JSON.parse(text.slice(i, end + 1));
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
        expectKey = false;
      }
      i = end;
    } else if (char === '{' || char === '[') {
      depth++;
      expectKey = depth === 1 && char === '{';
    } else if (char === '}' || char === ']') {
      depth--;
    } else if (char === ',' && depth === 1) {
      expectKey = true;
    }
  }

  return keys.map(key => [key, value[key]]);
}
