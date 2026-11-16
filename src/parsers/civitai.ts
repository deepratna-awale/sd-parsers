import { Parser, ReplacementRules, popKeys, isDict, hasKey } from './parser';
import { Generators, createPromptInfo, createSampler, createModel, PromptInfo, Model } from '../data';
import { ParserError } from '../exceptions';
import { readJsonObject, take, promptList } from './helpers';

const SAMPLER_PARAMS = ['seed', 'steps', 'cfgScale', 'clipSkip', 'denoise'];
const REPLACEMENT_RULES: ReplacementRules = [
  ['cfgScale', 'cfg_scale'],
  ['clipSkip', 'clip_skip'],
];

/**
 * Find the checkpoint of a CivitAI node graph (an AIR such as `urn:air:sdxl:checkpoint:civitai:827184@2514310`)
 */
function checkpointFromGraph(graph: Record<string, any>): string | undefined {
  for (const node of Object.values(graph)) {
    if (isDict(node) && isDict(node.inputs) && typeof node.inputs.ckpt_name === 'string') {
      return node.inputs.ckpt_name;
    }
  }
  return undefined;
}

/**
 * Parser for images generated on CivitAI with its ComfyUI based generator, which writes
 * a node graph with an `extraMetadata` entry to the EXIF UserComment.
 *
 * Images CivitAI saves with AUTOMATIC1111 parameters are read by the AUTOMATIC1111 parser.
 */
export class CivitaiParser extends Parser {
  public readonly generator = Generators.CIVITAI;

  async parse(parameters: Record<string, any>): Promise<PromptInfo> {
    const source = [parameters.UserComment, parameters.prompt].find(
      value => typeof value === 'string' && value.includes('"extraMetadata"')
    );
    if (!source) {
      throw new ParserError('no CivitAI metadata found');
    }
    const graph = readJsonObject(source);
    if (!hasKey(graph, 'extraMetadata')) {
      throw new ParserError('no CivitAI metadata found');
    }
    const params = readJsonObject(graph.extraMetadata, 'extraMetadata');

    const samplerName = take(params, 'sampler') ?? 'unknown';
    const prompt = take(params, 'prompt');
    const negativePrompt = take(params, 'negativePrompt');

    const checkpoint = checkpointFromGraph(graph);
    const resources: any[] = Array.isArray(params.resources) ? params.resources : [];
    const checkpointResource = resources.find(resource => isDict(resource) && /checkpoint/i.test(String(resource.type)));
    let model: Model | undefined;
    if (checkpoint) {
      model = createModel({ name: checkpoint, metadata: checkpointResource ? { ...checkpointResource } : {} });
    }

    const sampler = createSampler(samplerName, this.normalizeParameters(popKeys(SAMPLER_PARAMS, params), REPLACEMENT_RULES), {
      model,
      prompts: promptList(prompt),
      negativePrompts: promptList(negativePrompt),
    });

    delete params.images;
    if (isDict(graph.extra) && Array.isArray(graph.extra.airs)) {
      params.airs = graph.extra.airs;
    }
    return createPromptInfo(this.generator, [sampler], params, parameters);
  }
}
