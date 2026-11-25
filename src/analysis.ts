import { Lora, PromptInfo, getFullNegativePrompt, getFullPrompt, getModels } from './data';

/** One comma separated part of a prompt, with the weight that its brackets give it */
export interface PromptToken {
  /** The text without emphasis brackets or explicit weight (`blue sky` for `(blue sky:1.2)`) */
  text: string;
  /** Lower-cased, with underscores and repeated spaces turned into single spaces, for comparing tokens */
  normalized: string;
  /** 1 when unweighted; `(x)` is 1.1, `[x]` 1/1.1, `{x}` (NovelAI) 1.05, `(x:1.3)` and NovelAI's `1.3::x::` 1.3 */
  weight: number;
  kind: 'tag' | 'lora' | 'embedding' | 'break';
}

/** The settings of an image as plain values, for display, comparison and grouping */
export interface GenerationSettings {
  generator: string;
  software: string;
  model?: string;
  modelHash?: string;
  sampler?: string;
  scheduler?: string;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  denoise?: number;
  width?: number;
  height?: number;
  loras: Lora[];
  prompt: string;
  negativePrompt: string;
}

export interface PromptDiff {
  /** Tokens only in the second prompt */
  added: PromptToken[];
  /** Tokens only in the first prompt */
  removed: PromptToken[];
  /** Tokens in both, with a different weight */
  reweighted: { token: string; from: number; to: number }[];
}

export interface MetadataComparison {
  prompt: PromptDiff;
  negativePrompt: PromptDiff;
  /** Settings that differ, as `[first, second]` */
  settings: Partial<Record<keyof Omit<GenerationSettings, 'loras' | 'prompt' | 'negativePrompt'>, [unknown, unknown]>>;
  loras: { added: Lora[]; removed: Lora[]; reweighted: { name: string; from?: number; to?: number }[] };
  /** Jaccard similarity of the positive prompts' tokens, 0 to 1 */
  promptSimilarity: number;
}

export interface Count<T = string> {
  value: T;
  count: number;
}

export interface Range {
  min: number;
  max: number;
  mean: number;
}

/** What a set of images have in common, most frequent first */
export interface CollectionStats {
  count: number;
  generators: Count[];
  software: Count[];
  models: Count[];
  samplers: Count[];
  schedulers: Count[];
  sizes: Count[];
  loras: Count[];
  /** Prompt tokens and the number of images that use them */
  tags: Count[];
  negativeTags: Count[];
  steps?: Range;
  cfgScale?: Range;
}

const WRAPPERS: Record<string, [string, number]> = { '(': [')', 1.1], '[': [']', 1 / 1.1], '{': ['}', 1.05] };

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** Split at commas and newlines outside brackets, and around BREAK */
function splitPrompt(prompt: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt[i];
    if (char === '\\' && i + 1 < prompt.length) {
      current += char + prompt[++i];
      continue;
    }
    if ('([{<'.includes(char)) depth++;
    else if (')]}>'.includes(char)) depth = Math.max(0, depth - 1);
    if ((char === ',' || char === '\n') && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.flatMap(part => part.split(/(\bBREAK\b)/)).map(part => part.trim()).filter(Boolean);
}

function unwrap(text: string): { text: string; weight: number } {
  let weight = 1;
  let value = text.trim();
  for (;;) {
    const novelai = /^(-?\d+(?:\.\d+)?)::([\s\S]*?)(?:::)?$/.exec(value);
    if (novelai) {
      weight *= Number(novelai[1]);
      value = novelai[2].trim();
      continue;
    }
    const wrapper = WRAPPERS[value[0]];
    if (!wrapper || value[value.length - 1] !== wrapper[0] || value[value.length - 2] === '\\') break;
    const inner = value.slice(1, -1).trim();
    const explicit = value[0] !== '{' ? /^([\s\S]*?):\s*(-?\d+(?:\.\d+)?)$/.exec(inner) : null;
    if (explicit && value[0] === '(') {
      weight *= Number(explicit[2]);
      value = explicit[1].trim();
    } else {
      weight *= wrapper[1];
      value = inner;
    }
  }
  return { text: value, weight: round(weight) };
}

/** Lower-case, unescape brackets and turn underscores and repeated spaces into single spaces */
export function normalizeTag(text: string): string {
  return text
    .replace(/\\([()[\]{}])/g, '$1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Split a prompt into its comma separated tokens and work out their weights. Understands
 * A1111 / ComfyUI emphasis (`(x)`, `((x))`, `[x]`, `(x:1.2)`), NovelAI emphasis (`{x}`,
 * `1.2::x::`), `<lora:...>` tags, `embedding:` names and `BREAK`.
 */
export function parsePromptTokens(prompt: string): PromptToken[] {
  const tokens: PromptToken[] = [];
  for (const part of splitPrompt(prompt)) {
    if (part === 'BREAK') {
      tokens.push({ text: 'BREAK', normalized: 'break', weight: 1, kind: 'break' });
      continue;
    }
    const lora = /^<(?:lora|lyco):([^:>]+)(?::(-?[\d.]+))?[^>]*>$/i.exec(part);
    if (lora) {
      tokens.push({ text: lora[1].trim(), normalized: normalizeTag(lora[1]), weight: lora[2] ? Number(lora[2]) : 1, kind: 'lora' });
      continue;
    }
    // LoRA tags written next to other text: count both
    let rest = part;
    for (const match of part.matchAll(/<(?:lora|lyco):([^:>]+)(?::(-?[\d.]+))?[^>]*>/gi)) {
      tokens.push({ text: match[1].trim(), normalized: normalizeTag(match[1]), weight: match[2] ? Number(match[2]) : 1, kind: 'lora' });
      rest = rest.replace(match[0], '');
    }
    rest = rest.trim();
    if (!rest) continue;
    const { text, weight } = unwrap(rest);
    if (!text) continue;
    const embedding = /^embedding:(.+)$/i.exec(text);
    if (embedding) {
      const name = embedding[1].replace(/\.(?:pt|safetensors|bin)$/i, '');
      tokens.push({ text: name, normalized: normalizeTag(name), weight, kind: 'embedding' });
    } else {
      tokens.push({ text, normalized: normalizeTag(text), weight, kind: 'tag' });
    }
  }
  return tokens;
}

function toNumber(value: unknown): number | undefined {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : undefined;
}

/** Fooocus records its full prompts as a list, one entry per style */
function promptText(value: unknown): string {
  if (Array.isArray(value)) return value.filter(part => typeof part === 'string' && part.trim()).join(', ');
  return typeof value === 'string' ? value : '';
}

/**
 * The settings of a parsed image as plain values: model, sampler, scheduler, steps, CFG scale,
 * seed, size, LoRAs and the full prompts. Values that tools write as text become numbers.
 * For images with several samplers (hires fix, refiners), the first sampler's settings are used.
 */
export function getGenerationSettings(promptInfo: PromptInfo): GenerationSettings {
  const [sampler] = promptInfo.samplers;
  const [model] = getModels(promptInfo);
  const parameters = sampler?.parameters ?? {};
  const settings: GenerationSettings = {
    generator: promptInfo.generator,
    software: promptInfo.software ?? promptInfo.generator,
    model: model?.name,
    modelHash: model?.hash,
    sampler: sampler?.name,
    scheduler: typeof parameters.scheduler === 'string' ? parameters.scheduler : undefined,
    steps: toNumber(parameters.steps),
    cfgScale: toNumber(parameters.cfg_scale),
    seed: toNumber(parameters.seed),
    denoise: toNumber(parameters.denoise ?? parameters.denoising_strength),
    width: promptInfo.width,
    height: promptInfo.height,
    loras: promptInfo.loras ?? [],
    prompt: promptText(getFullPrompt(promptInfo)),
    negativePrompt: promptText(getFullNegativePrompt(promptInfo)),
  };
  for (const key of Object.keys(settings) as (keyof GenerationSettings)[]) {
    if (settings[key] === undefined) delete settings[key];
  }
  return settings;
}

function tokenMap(prompt: string): Map<string, PromptToken> {
  const map = new Map<string, PromptToken>();
  for (const token of parsePromptTokens(prompt)) {
    if (token.kind === 'break') continue;
    const key = `${token.kind}:${token.normalized}`;
    if (!map.has(key)) map.set(key, token);
  }
  return map;
}

/** Tokens added, removed and reweighted from the first prompt to the second */
export function diffPrompts(first: string, second: string): PromptDiff {
  const before = tokenMap(first);
  const after = tokenMap(second);
  const diff: PromptDiff = { added: [], removed: [], reweighted: [] };
  for (const [key, token] of after) {
    const old = before.get(key);
    if (!old) diff.added.push(token);
    else if (old.weight !== token.weight) diff.reweighted.push({ token: token.text, from: old.weight, to: token.weight });
  }
  for (const [key, token] of before) {
    if (!after.has(key)) diff.removed.push(token);
  }
  return diff;
}

/**
 * How alike two prompts are: the share of their tokens (ignoring weights, case and
 * underscores) that they have in common, from 0 (nothing) to 1 (the same tokens)
 */
export function promptSimilarity(first: string, second: string): number {
  const a = new Set(tokenMap(first).keys());
  const b = new Set(tokenMap(second).keys());
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const key of a) if (b.has(key)) shared++;
  return round(shared / (a.size + b.size - shared));
}

/** File name without directory and extension */
const fileName = (name: string) => name.replace(/^.*[\\/]/, '').replace(/\.(?:safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, '');
const loraName = (lora: Lora) => fileName(lora.name);
const loraKey = (lora: Lora) => normalizeTag(loraName(lora));
/** Model names compare equal with or without directory and extension (`a/b.safetensors` and `b`) */
const sameName = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && normalizeTag(fileName(a)) === normalizeTag(fileName(b));

/**
 * Compare the generation data of two images: prompt tokens added, removed and reweighted,
 * settings that differ, LoRA changes and how similar the prompts are
 */
export function compareMetadata(first: PromptInfo, second: PromptInfo): MetadataComparison {
  const a = getGenerationSettings(first);
  const b = getGenerationSettings(second);
  const settings: MetadataComparison['settings'] = {};
  const keys = ['generator', 'software', 'model', 'modelHash', 'sampler', 'scheduler', 'steps', 'cfgScale', 'seed', 'denoise', 'width', 'height'] as const;
  for (const key of keys) {
    if (a[key] !== b[key] && !(key === 'model' && sameName(a[key], b[key]))) settings[key] = [a[key], b[key]];
  }

  const before = new Map(a.loras.map(lora => [loraKey(lora), lora]));
  const after = new Map(b.loras.map(lora => [loraKey(lora), lora]));
  const loras: MetadataComparison['loras'] = { added: [], removed: [], reweighted: [] };
  for (const [key, lora] of after) {
    const old = before.get(key);
    if (!old) loras.added.push(lora);
    else if (old.weight !== lora.weight) loras.reweighted.push({ name: lora.name, from: old.weight, to: lora.weight });
  }
  for (const [key, lora] of before) if (!after.has(key)) loras.removed.push(lora);

  return {
    prompt: diffPrompts(a.prompt, b.prompt),
    negativePrompt: diffPrompts(a.negativePrompt, b.negativePrompt),
    settings,
    loras,
    promptSimilarity: promptSimilarity(a.prompt, b.prompt),
  };
}

class Counter {
  private counts = new Map<string, number>();
  private labels = new Map<string, string>();

  /** Count `value`, grouped by `key` and shown as the first value seen for it */
  add(value: string | undefined, key = value) {
    if (!value || !key) return;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    if (!this.labels.has(key)) this.labels.set(key, value);
  }

  sorted(): Count[] {
    return [...this.counts].map(([key, count]) => ({ value: this.labels.get(key)!, count })).sort((x, y) => y.count - x.count || x.value.localeCompare(y.value));
  }
}

function range(values: number[]): Range | undefined {
  if (values.length === 0) return undefined;
  return { min: Math.min(...values), max: Math.max(...values), mean: round(values.reduce((total, value) => total + value, 0) / values.length) };
}

/**
 * Count what a set of parsed images use: generators, tools, models, samplers, schedulers,
 * sizes, LoRAs and prompt tokens (each counted once per image), and the range of steps
 * and CFG scales. Handy to see what a folder of images was made with.
 */
export function analyzeCollection(promptInfos: Iterable<PromptInfo | null | undefined>): CollectionStats {
  const counters = {
    generators: new Counter(),
    software: new Counter(),
    models: new Counter(),
    samplers: new Counter(),
    schedulers: new Counter(),
    sizes: new Counter(),
    loras: new Counter(),
    tags: new Counter(),
    negativeTags: new Counter(),
  };
  const steps: number[] = [];
  const cfgScales: number[] = [];
  let count = 0;

  for (const promptInfo of promptInfos) {
    if (!promptInfo) continue;
    count++;
    const settings = getGenerationSettings(promptInfo);
    counters.generators.add(settings.generator);
    counters.software.add(settings.software);
    if (settings.model) counters.models.add(fileName(settings.model), normalizeTag(fileName(settings.model)));
    counters.samplers.add(settings.sampler);
    counters.schedulers.add(settings.scheduler);
    if (settings.width && settings.height) counters.sizes.add(`${settings.width}x${settings.height}`);
    const loras = new Map(settings.loras.map(lora => [loraKey(lora), loraName(lora)]));
    for (const [key, name] of loras) counters.loras.add(name, key);
    for (const token of new Set([...tokenMap(settings.prompt).values()].filter(token => token.kind === 'tag').map(token => token.normalized))) counters.tags.add(token);
    for (const token of new Set([...tokenMap(settings.negativePrompt).values()].filter(token => token.kind === 'tag').map(token => token.normalized))) {
      counters.negativeTags.add(token);
    }
    if (settings.steps !== undefined) steps.push(settings.steps);
    if (settings.cfgScale !== undefined) cfgScales.push(settings.cfgScale);
  }

  const stats: CollectionStats = {
    count,
    generators: counters.generators.sorted(),
    software: counters.software.sorted(),
    models: counters.models.sorted(),
    samplers: counters.samplers.sorted(),
    schedulers: counters.schedulers.sorted(),
    sizes: counters.sizes.sorted(),
    loras: counters.loras.sorted(),
    tags: counters.tags.sorted(),
    negativeTags: counters.negativeTags.sorted(),
  };
  const stepRange = range(steps);
  const cfgRange = range(cfgScales);
  if (stepRange) stats.steps = stepRange;
  if (cfgRange) stats.cfgScale = cfgRange;
  return stats;
}
