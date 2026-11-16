import { Parser, ReplacementRules, popKeys, hasKey } from './parser';
import { Generators, createPromptInfo, createSampler, createModel, PromptInfo } from '../data';
import { ParserError } from '../exceptions';
import { readJsonObject, take, promptList } from './helpers';

const SAMPLER_PARAMS = ['seed', 'num_inference_steps', 'guidance_scale'];
const REPLACEMENT_RULES: ReplacementRules = [
  ['num_inference_steps', 'steps'],
  ['guidance_scale', 'cfg_scale'],
];

/**
 * Parser for images made with the popular Stable Diffusion XL Hugging Face Spaces,
 * which write a JSON object with `resolution` and `Model` fields
 */
export class HFSpaceParser extends Parser {
  public readonly generator = Generators.HF_SPACE;

  async parse(parameters: Record<string, any>): Promise<PromptInfo> {
    const source = parameters.parameters ?? parameters.UserComment;
    if (typeof source !== 'string' || !source.trimStart().startsWith('{')) {
      throw new ParserError('no parameters found');
    }
    const params = readJsonObject(source);
    if (!hasKey(params, 'resolution') || !hasKey(params, 'Model') || !hasKey(params, 'prompt')) {
      throw new ParserError('not a Hugging Face Space image');
    }

    const samplerName = take(params, 'sampler') ?? 'unknown';
    const prompt = take(params, 'prompt');
    const negativePrompt = take(params, 'negative_prompt');
    const name = take(params, 'Model');
    const hash = take(params, 'Model hash');
    const model = name || hash ? createModel({ name: name ?? undefined, hash: hash ?? undefined }) : undefined;

    const sampler = createSampler(samplerName, this.normalizeParameters(popKeys(SAMPLER_PARAMS, params), REPLACEMENT_RULES), {
      model,
      prompts: promptList(prompt),
      negativePrompts: promptList(negativePrompt),
    });

    if (params.use_upscaler == null) delete params.use_upscaler;
    return createPromptInfo(this.generator, [sampler], params, parameters);
  }
}
