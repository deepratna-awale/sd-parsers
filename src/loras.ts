import { Generators, Lora, PromptInfo } from './data';

export type { Lora };
import { extractMetadata } from './parsers/automatic1111';
import { isDict } from './parsers/parser';
import { loadJson } from './utils/json';

type Node = { class_type?: string; inputs?: Record<string, any> };

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  try {
    return loadJson(value.replace(/[\u0000\s]+$/, ''));
  } catch {
    return undefined;
  }
}

function makeLora(name: unknown, weight?: unknown, clipWeight?: unknown, hash?: unknown): Lora | null {
  if (typeof name !== 'string' || !name.trim() || name === 'None') return null;
  const lora: Lora = { name: name.trim() };
  const w = num(weight);
  const c = num(clipWeight);
  if (w !== undefined) lora.weight = w;
  if (c !== undefined && c !== w) lora.clipWeight = c;
  if (typeof hash === 'string' && hash) lora.hash = hash;
  return lora;
}

function compact(loras: (Lora | null)[]): Lora[] {
  return loras.filter((lora): lora is Lora => lora !== null);
}

/** File name without directory and extension, the name A1111 uses in `<lora:...>` tags */
export function loraTagName(name: string): string {
  return name.replace(/^.*[\\/]/, '').replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, '');
}

/**
 * Read `<lora:name:weight>` / `<lora:name:unet:te>` (and `<lyco:...>`) tags from a prompt
 */
export function lorasFromPromptTags(prompt: string): Lora[] {
  const loras: Lora[] = [];
  for (const match of prompt.matchAll(/<(?:lora|lyco):([^>]+)>/gi)) {
    const parts = match[1].split(':');
    let name = parts.shift() ?? '';
    // names may hold colons; the weights are the trailing numeric parts
    while (parts.length > 2 || (parts.length > 0 && num(parts[0]) === undefined)) {
      name += ':' + parts.shift();
    }
    const lora = makeLora(name, parts[0] ?? 1, parts[1]);
    if (lora) loras.push(lora);
  }
  return loras;
}

/**
 * Read the LoRAs of an AUTOMATIC1111 style parameter string: prompt tags, `Lora hashes`
 * and CivitAI's `Civitai resources`
 */
export function lorasFromA1111(parameters: string): Lora[] {
  const lines = parameters.split('\n');
  const settings = extractMetadata(lines[lines.length - 1] ?? '');
  const prompt = parameters.split('Negative prompt:')[0];
  const loras = lorasFromPromptTags(prompt);

  const hashes = new Map<string, string>();
  if (typeof settings['Lora hashes'] === 'string') {
    for (const entry of settings['Lora hashes'].split(',')) {
      const separator = entry.lastIndexOf(':');
      if (separator > 0) hashes.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
    }
  }
  for (const lora of loras) {
    const hash = hashes.get(lora.name) ?? hashes.get(lora.name.replace(/,/g, ''));
    if (hash) lora.hash = hash;
  }

  // ComfyUI's SaveImageWithMetaData: `Lora_0 Model name: x, Lora_0 Strength model: 1, ...`
  for (let i = 0; typeof settings[`Lora_${i} Model name`] === 'string'; i++) {
    const lora = makeLora(
      settings[`Lora_${i} Model name`],
      settings[`Lora_${i} Strength model`],
      settings[`Lora_${i} Strength clip`],
      settings[`Lora_${i} Model hash`]
    );
    if (lora) loras.push(lora);
  }

  if (Array.isArray(settings['Civitai resources'])) {
    for (const resource of settings['Civitai resources']) {
      if (!isDict(resource) || !/lora|lycoris|locon/i.test(str(resource.type))) continue;
      const name = resource.modelName ?? resource.modelVersionName;
      if (loras.some(lora => lora.name === name)) continue;
      const lora = makeLora(name, resource.weight, undefined, resource.hash);
      if (lora) loras.push(lora);
    }
  }
  return loras;
}

/**
 * The LoRAs of one ComfyUI node: loader nodes, stack nodes with numbered slots and
 * the loader nodes of popular node packs
 */
function lorasFromComfyNode(node: Node): Lora[] {
  const inputs = isDict(node.inputs) ? node.inputs : {};
  const classType = str(node.class_type);
  if (inputs.toggle === false) return [];

  // LoraLoader, LoraLoaderModelOnly and their many look-alikes
  if (typeof inputs.lora_name === 'string') {
    return compact([
      makeLora(
        inputs.lora_name,
        inputs.strength_model ?? inputs.lora_model_strength ?? inputs.lora_strength ?? inputs.strength ?? inputs.model_weight,
        inputs.strength_clip ?? inputs.lora_clip_strength ?? inputs.clip_strength ?? inputs.clip_weight
      ),
    ]);
  }

  // LoRA Manager: a list with an active flag per LoRA
  if (Array.isArray(inputs.loras) || Array.isArray(inputs.loras?.__value__)) {
    const list: any[] = Array.isArray(inputs.loras) ? inputs.loras : inputs.loras.__value__;
    return compact(list.filter(entry => isDict(entry) && entry.active !== false).map(entry => makeLora(entry.name, entry.strength, entry.clipStrength)));
  }

  // rgthree Power Lora Loader: one object per slot
  const slotObjects = Object.entries(inputs).filter(([key, value]) => /^lora_\d+$/.test(key) && isDict(value));
  if (slotObjects.length > 0) {
    return compact(
      slotObjects
        .map(([, value]) => value)
        .filter(value => value.on !== false)
        .map(value => makeLora(value.lora, value.strength, value.strengthTwo))
    );
  }

  // easy loraSwitcher: only the selected slot is applied
  if (num(inputs.select) !== undefined && /switch/i.test(classType)) {
    return compact([makeLora(inputs[`lora_${inputs.select}_name`], inputs.lora_strength)]);
  }

  // numbered slots: CR LoRA Stack, Efficiency LoRA Stacker, easy loraStack, rgthree Lora Loader Stack
  const simple = inputs.mode === 'simple' || inputs.input_mode === 'simple';
  const count = num(inputs.num_loras) ?? num(inputs.lora_count);
  const loras: Lora[] = [];
  for (const key of Object.keys(inputs)) {
    const match = /^lora_name_(\d+)$|^lora_(\d+)_name$|^lora_(\d+)$/.exec(key);
    if (!match || typeof inputs[key] !== 'string') continue;
    const slot = match[1] ?? match[2] ?? match[3];
    const index = Number(slot);
    if (count !== undefined && index > count) continue;
    if (inputs[`switch_${slot}`] === 'Off') continue;

    const weight = simple
      ? inputs[`lora_${slot}_strength`] ?? inputs[`lora_wt_${slot}`]
      : inputs[`model_weight_${slot}`] ??
        inputs[`lora_${slot}_model_strength`] ??
        inputs[`model_str_${slot}`] ??
        inputs[`strength_${slot}`] ??
        inputs[`lora_${slot}_strength`] ??
        inputs[`lora_wt_${slot}`];
    const clipWeight = simple ? undefined : inputs[`clip_weight_${slot}`] ?? inputs[`lora_${slot}_clip_strength`] ?? inputs[`clip_str_${slot}`];
    const lora = makeLora(inputs[key], weight, clipWeight);
    if (lora) loras.push(lora);
  }
  if (loras.length > 0) return loras;

  // prompt nodes that apply `<lora:...>` tags themselves (rgthree Power Prompt)
  if (/lora|power prompt/i.test(classType)) {
    for (const key of ['text', 'prompt']) {
      if (typeof inputs[key] === 'string' && /<(?:lora|lyco):/i.test(inputs[key])) {
        return lorasFromPromptTags(inputs[key]);
      }
    }
  }
  return [];
}

/**
 * Read the LoRAs of a ComfyUI API graph that the samplers actually depend on, so that
 * unconnected loaders are left out (bypassed ones are not part of the graph at all)
 */
export function lorasFromComfyGraph(graph: Record<string, any>, samplerIds: string[] = []): Lora[] {
  const nodes = new Map<string, Node>();
  for (const [id, node] of Object.entries(graph)) {
    if (isDict(node) && isDict(node.inputs) && typeof node.class_type === 'string') nodes.set(String(id), node);
  }

  let starts = samplerIds.filter(id => nodes.has(id));
  if (starts.length === 0) {
    starts = [...nodes].filter(([, node]) => /sampler/i.test(str(node.class_type)) && ('model' in node.inputs! || 'guider' in node.inputs!)).map(([id]) => id);
  }

  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) return;
    for (const value of Object.values(node.inputs ?? {})) {
      if (Array.isArray(value) && value.length === 2 && nodes.has(String(value[0]))) visit(String(value[0]));
    }
    order.push(id);
  };
  // without a sampler there is nothing to trace from, so every loader counts
  if (starts.length === 0) starts = [...nodes.keys()];
  starts.forEach(visit);

  // upstream first, so loaders come in the order they are chained
  return order.flatMap(id => lorasFromComfyNode(nodes.get(id)!));
}

function dedupe(loras: Lora[]): Lora[] {
  const seen = new Set<string>();
  return loras.filter(lora => {
    const key = JSON.stringify([lora.name, lora.weight, lora.clipWeight]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fromGenerator(promptInfo: PromptInfo): Lora[] | null {
  const raw = promptInfo.rawParameters ?? {};
  const metadata = promptInfo.metadata ?? {};

  switch (promptInfo.generator) {
    case Generators.SWARMUI: {
      const names: unknown[] = Array.isArray(metadata.loras) ? metadata.loras : [];
      const weights: unknown[] = Array.isArray(metadata.loraweights) ? metadata.loraweights : [];
      const models: any[] = Array.isArray(metadata.sui_models) ? metadata.sui_models : [];
      return compact(
        names.map((name, i) => {
          const model = models.find(m => isDict(m) && m.param === 'loras' && loraTagName(str(m.name)) === name);
          return makeLora(name, weights[i], undefined, model?.hash);
        })
      );
    }
    case Generators.EASYDIFFUSION: {
      const names = metadata.use_lora_model;
      const weights = metadata.lora_alpha;
      if (typeof names === 'string') return compact([makeLora(names, weights)]);
      if (!Array.isArray(names)) return [];
      return compact(names.map((name, i) => makeLora(name, Array.isArray(weights) ? weights[i] : weights)));
    }
    case Generators.RUINED_FOOOCUS: {
      const list: any[] = Array.isArray(metadata.loras) ? metadata.loras : [];
      return compact(
        list.map(entry => {
          if (!Array.isArray(entry)) return null;
          const match = /^\s*(-?[\d.]+)\s*-\s*(.+)$/.exec(str(entry[1]));
          return match ? makeLora(match[2], match[1], undefined, entry[0] || undefined) : makeLora(entry[1], undefined, undefined, entry[0] || undefined);
        })
      );
    }
    case Generators.FOOOCUS: {
      const list: any[] = Array.isArray(metadata.loras) ? metadata.loras : [];
      if (list.length > 0) return compact(list.map(entry => (Array.isArray(entry) ? makeLora(entry[0], entry[1], undefined, entry[2]) : null)));
      return compact(
        Object.entries(metadata)
          .filter(([key]) => /^lora_combined_\d+$/.test(key))
          .map(([, value]) => {
            const [name, weight] = str(value).split(' : ');
            return makeLora(name, weight);
          })
      );
    }
    case Generators.INVOKEAI: {
      const data = parseJson(raw.invokeai_metadata);
      const list: any[] = Array.isArray(data?.loras) ? data.loras : [];
      return compact(
        list.map(entry => {
          if (!isDict(entry)) return null;
          const model = isDict(entry.model) ? entry.model : isDict(entry.lora) ? entry.lora : {};
          return makeLora(model.name ?? model.model_name, entry.weight, undefined, model.hash);
        })
      );
    }
    case Generators.DRAWTHINGS: {
      const list: any[] = Array.isArray(metadata.lora) ? metadata.lora : [];
      // weights are stored as 32-bit floats (0.30000001192092896)
      const round = (value: unknown) => (num(value) === undefined ? undefined : Math.round(num(value)! * 1e6) / 1e6);
      return compact(list.map(entry => (isDict(entry) ? makeLora(entry.model, round(entry.weight)) : null)));
    }
    case Generators.DEZGO:
      return compact(
        Object.keys(metadata)
          .filter(key => /^lora\d+$/.test(key))
          .map(key => makeLora(metadata[key], metadata[`${key}_strength`]))
      );
    case Generators.TENSORART: {
      const data = parseJson(raw.generation_data);
      const list: any[] = Array.isArray(data?.models) ? data.models : [];
      return compact(
        list
          .filter(model => isDict(model) && /lora|lycoris/i.test(str(model.type)))
          .map(model => makeLora(model.modelFileName ?? model.label, model.weight, undefined, model.hash))
      );
    }
    default:
      return null;
  }
}

/**
 * Get the LoRAs that were applied to an image, in the order the tool lists them
 */
export function getLoras(promptInfo: PromptInfo): Lora[] {
  const specific = fromGenerator(promptInfo);
  if (specific && specific.length > 0) return dedupe(specific);

  const raw = promptInfo.rawParameters ?? {};
  const text = [raw.parameters, raw.UserComment].find(value => typeof value === 'string' && !value.trimStart().startsWith('{'));
  if (promptInfo.generator === Generators.AUTOMATIC1111 && typeof text === 'string') {
    const loras = lorasFromA1111(text);
    if (loras.length > 0) return dedupe(loras);
  }

  for (const source of [raw.prompt, raw.UserComment]) {
    const graph = parseJson(source);
    if (!isDict(graph) || !Object.values(graph).some(node => isDict(node) && 'class_type' in node)) continue;
    const samplerIds = promptInfo.samplers.map(sampler => sampler.samplerId).filter((id): id is string => !!id);
    return dedupe(lorasFromComfyGraph(graph, samplerIds));
  }
  return [];
}
