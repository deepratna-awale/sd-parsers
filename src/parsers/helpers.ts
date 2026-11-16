import { Prompt, createPrompt } from '../data';
import { ParserError } from '../exceptions';
import { loadJson } from '../utils/json';
import { isDict } from './parser';

/**
 * Decode a JSON object, from a string or as an object already, or throw a ParserError
 */
export function readJsonObject(value: unknown, what = 'parameters'): Record<string, any> {
  let decoded: unknown = value;
  if (typeof value === 'string') {
    try {
      // TensorArt ends its JSON with a null character
      decoded = loadJson(value.replace(/[\u0000\s]+$/, ''));
    } catch (error) {
      throw new ParserError(`error decoding ${what}: ${error}`);
    }
  }
  if (!isDict(decoded)) {
    throw new ParserError(`error decoding ${what}`);
  }
  return decoded;
}

/**
 * Remove a key from an object and return its value
 */
export function take(object: Record<string, any>, key: string): any {
  const value = object[key];
  delete object[key];
  return value;
}

/**
 * Remove the given keys from an object and return the ones with a value, under new names
 */
export function takeAll(object: Record<string, any>, keys: Record<string, string>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, name] of Object.entries(keys)) {
    const value = take(object, key);
    if (value !== undefined && value !== null && value !== '') {
      result[name] = value;
    }
  }
  return result;
}

/**
 * Turn a numeric string into a number, leaving other values as they are
 */
export function toNumber(value: any): any {
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}

/**
 * Parse the small subset of YAML that tools use to write flat or nested `key: value` records
 */
export function parseSimpleYaml(text: string): Record<string, any> {
  const root: Record<string, any> = {};
  const stack: { indent: number; object: Record<string, any> }[] = [{ indent: -1, object: root }];
  const lines = text.split(/\r?\n/);
  const indentOf = (line: string) => line.length - line.trimStart().length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = indentOf(line);
    const match = /^([^:]+?):(?:\s+(.*))?$/.exec(line.trim());
    if (!match) {
      throw new ParserError(`unsupported YAML line: ${line}`);
    }
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].object;
    const [, key, rawValue] = match;

    if (rawValue === undefined || rawValue === '') {
      const child: Record<string, any> = {};
      parent[key] = child;
      stack.push({ indent, object: child });
      continue;
    }

    const block = /^([>|])([+-]?)$/.exec(rawValue);
    if (!block) {
      parent[key] = parseYamlScalar(rawValue);
      continue;
    }

    // block scalar: the following lines that are indented deeper, or empty
    const body: string[] = [];
    while (i + 1 < lines.length && (!lines[i + 1].trim() || indentOf(lines[i + 1]) > indent)) {
      body.push(lines[++i]);
    }
    while (body.length > 0 && !body[body.length - 1].trim()) body.pop();
    const bodyIndent = Math.min(...body.filter(l => l.trim()).map(indentOf));
    const content = body.map(l => l.slice(bodyIndent));
    let value: string;
    if (block[1] === '|') {
      value = content.join('\n');
    } else {
      value = '';
      for (let j = 0; j < content.length; j++) {
        if (content[j] === '') {
          value += '\n';
        } else {
          value += (j > 0 && content[j - 1] !== '' ? ' ' : '') + content[j];
        }
      }
    }
    parent[key] = block[2] === '-' ? value : value + '\n';
  }
  return root;
}

function parseYamlScalar(value: string): any {
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  return toNumber(value);
}

/**
 * A list holding one prompt for a non-empty string, or an empty list
 */
export function promptList(value: unknown): Prompt[] {
  return typeof value === 'string' && value.trim() ? [createPrompt(value.trim())] : [];
}
