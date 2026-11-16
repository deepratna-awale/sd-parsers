import { Generators, PromptInfo } from './data';

/**
 * Name the tool behind an AUTOMATIC1111 style parameter string, from its `Version` and `App` fields
 */
export function detectA1111Software(parameters: string): string | undefined {
  if (/(?:^|[,\n])\s*App:\s*SD\.Next\b/.test(parameters)) return 'SD.Next';
  if (parameters.includes('Civitai resources:') || parameters.includes('Civitai metadata:')) return 'Civitai';

  // a standalone "Version:" field, not one with a prefix like "ADetailer version:"
  const match = /(?:^|[,\n])\s*Version:\s*([^\s,]+)/.exec(parameters);
  if (!match) return undefined;
  const version = match[1];

  if (/^v\d/.test(version)) return 'Stable Diffusion WebUI';
  if (version === 'classic') return 'Forge Classic';
  if (version.startsWith('neo')) return 'Forge Neo';
  if (/^f\d+\.\d+(?:\.\d+)?-v/.test(version)) return 'EasyReforge';
  if (/^f\d+\.\d+(?:\.\d+)?v\d+-v/.test(version)) return 'reForge';
  if (/^f\d/.test(version)) return 'Forge';
  if (version.startsWith('Fooocus')) return 'Fooocus';
  if (version === 'ComfyUI') return 'ComfyUI';
  return undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Work out which tool made an image, from its parsed generation data and its raw metadata.
 * Falls back to the name of the generator.
 */
export function detectSoftware(promptInfo: PromptInfo): string {
  const raw = promptInfo.rawParameters ?? {};

  if (raw.smproj !== undefined || raw['parameters-json'] !== undefined) return 'Stability Matrix';
  if (raw.generation_data !== undefined) return 'TensorArt';
  if (text(raw.Software).startsWith('Fooocus') || raw.fooocus_scheme !== undefined || raw.MakerNote === 'a1111') {
    return 'Fooocus';
  }

  if (promptInfo.generator === Generators.AUTOMATIC1111) {
    const detected = detectA1111Software(text(raw.parameters ?? raw.UserComment));
    if (detected) return detected;
    // ComfyUI save nodes that write AUTOMATIC1111 parameters next to the node graph
    if (text(raw.prompt).includes('"class_type"')) return 'ComfyUI';
  }

  return promptInfo.generator;
}
