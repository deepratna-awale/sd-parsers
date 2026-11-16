import { Generators, PromptInfo, getFullPrompt, getFullNegativePrompt, getModels } from './data';
import { getLoras, loraTagName, lorasFromPromptTags } from './loras';
import { getGenerationSize } from './size';

function joinPrompt(value: unknown): string {
  if (Array.isArray(value)) return value.filter(part => typeof part === 'string' && part.trim()).join(', ');
  return typeof value === 'string' ? value : '';
}

function formatValue(value: unknown): string {
  if (typeof value === 'number' && !Number.isInteger(value)) value = Number(value.toPrecision(6));
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return /[,:\n"]/.test(text) ? JSON.stringify(text) : text;
}

function pick(parameters: Record<string, any>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = parameters[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * Format the generation data of an image as AUTOMATIC1111 style parameters ("infotext"),
 * the text most tools accept for pasting settings and that `writeMetadata()` embeds.
 *
 * Images in the AUTOMATIC1111 format get their original text back. For the others, the
 * prompts, the first sampler's settings, the model and the LoRAs are written.
 */
export function toInfotext(promptInfo: PromptInfo): string {
  const raw = promptInfo.rawParameters ?? {};
  if (promptInfo.generator === Generators.AUTOMATIC1111) {
    const original = [raw.parameters, raw.UserComment].find(value => typeof value === 'string' && value.trim() && !value.trimStart().startsWith('{'));
    if (typeof original === 'string') return original.replace(/\r\n?/g, '\n').trim();
  }

  let prompt = joinPrompt(getFullPrompt(promptInfo)).replace(/\r\n?/g, '\n').trim();
  const negativePrompt = joinPrompt(getFullNegativePrompt(promptInfo)).replace(/\r\n?/g, '\n').trim();

  const loras = promptInfo.loras ?? getLoras(promptInfo);
  const tagged = new Set(lorasFromPromptTags(prompt).map(lora => lora.name));
  const tags = loras
    .filter(lora => !tagged.has(loraTagName(lora.name)) && !tagged.has(lora.name))
    .map(lora => {
      const weights = [lora.weight ?? 1, ...(lora.clipWeight !== undefined ? [lora.clipWeight] : [])];
      return `<lora:${loraTagName(lora.name)}:${weights.join(':')}>`;
    });
  if (tags.length > 0) prompt = prompt ? `${prompt}\n${tags.join(' ')}` : tags.join(' ');

  const sampler = promptInfo.samplers[0];
  const parameters = { ...promptInfo.metadata, ...(sampler?.parameters ?? {}) };
  const model = getModels(promptInfo)[0];
  const size = getGenerationSize(promptInfo) ?? (promptInfo.width && promptInfo.height ? { width: promptInfo.width, height: promptInfo.height } : null);
  const loraHashes = loras.filter(lora => lora.hash).map(lora => `${loraTagName(lora.name)}: ${lora.hash}`);

  const fields: [string, unknown][] = [
    ['Steps', pick(parameters, 'steps', 'Steps', 'num_inference_steps')],
    ['Sampler', sampler && sampler.name !== 'unknown' ? sampler.name : undefined],
    ['Schedule type', pick(parameters, 'scheduler', 'scheduler_name', 'schedule')],
    ['CFG scale', pick(parameters, 'cfg_scale', 'cfg', 'cfgscale', 'guidance_scale', 'scale')],
    ['Seed', pick(parameters, 'seed', 'Seed', 'noise_seed')],
    ['Size', size ? `${size.width}x${size.height}` : undefined],
    ['Model hash', model?.hash],
    ['Model', model?.name ? loraTagName(model.name) : undefined],
    ['Denoising strength', (() => {
      const denoise = pick(parameters, 'denoising_strength', 'denoise', 'strength');
      return denoise === 1 || denoise === '1' ? undefined : denoise;
    })()],
    ['Clip skip', (() => {
      // Easy Diffusion stores a flag that means "skip the last layer"
      const clipSkip = pick(parameters, 'clip_skip', 'clipSkip');
      if (clipSkip === false) return undefined;
      return clipSkip === true ? 2 : clipSkip;
    })()],
    ['Lora hashes', loraHashes.length > 0 ? loraHashes.join(', ') : undefined],
  ];
  const settings = fields
    .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(', ');

  const lines = [prompt];
  if (negativePrompt) lines.push(`Negative prompt: ${negativePrompt}`);
  if (settings) lines.push(settings);
  return lines.join('\n');
}
