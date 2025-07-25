import { Parser, ReplacementRules, popKeys } from './parser';
import { Generators, createPromptInfo, createSampler, createModel, createPrompt, PromptInfo } from '../data';
import { ParserError } from '../exceptions';

const SAMPLER_PARAMS = ['seed', 'strength', 'noise', 'scale', 'steps'];
const REPLACEMENT_RULES: ReplacementRules = [];

/**
 * Parser for images generated by NovelAI
 */
export class NovelAIParser extends Parser {
  public readonly generator = Generators.NOVELAI;

  async parse(parameters: Record<string, any>): Promise<PromptInfo> {
    let metadata: Record<string, any>;
    let params: string;
    let source: string;

    try {
      // Handle different input formats
      if (parameters.parameters) {
        // Format 1: parameters field contains JSON string or object
        if (typeof parameters.parameters === 'string') {
          metadata = JSON.parse(parameters.parameters);
        } else {
          metadata = parameters.parameters;
        }
        params = metadata.prompt || '';
        source = metadata.source || '';
      } else {
        // Format 2: NovelAI standard fields
        metadata = JSON.parse(parameters.Comment || '{}');
        params = parameters.Description || '';
        source = parameters.Source || '';
      }
    } catch (error) {
      throw new ParserError(`Error reading parameter values: ${error}`);
    }

    let samplerName: string;
    try {
      samplerName = metadata.sampler;
      if (!samplerName) {
        throw new Error('Sampler name not found');
      }
      delete metadata.sampler;

      const samplerParams = Object.fromEntries(popKeys(SAMPLER_PARAMS, metadata));
      const normalizedParams = this.normalizeParameters(samplerParams, REPLACEMENT_RULES);

      const prompts = params?.trim() ? [createPrompt(params.trim())] : [];
      
      const negativePrompt = metadata.uc;
      delete metadata.uc;
      const negativePrompts = negativePrompt ? [createPrompt(negativePrompt)] : [];

      // Extract model from source
      let model: any = undefined;
      const modelMatch = source?.match(/^(.*?)\s+([A-Z0-9]+)$/);
      if (modelMatch) {
        const [, modelName, modelHash] = modelMatch;
        model = createModel({ name: modelName, hash: modelHash });
      }

      const sampler = createSampler(samplerName, normalizedParams, {
        model,
        prompts,
        negativePrompts
      });

      return createPromptInfo(this.generator, [sampler], metadata, parameters);
    } catch (error) {
      throw new ParserError(`No sampler found: ${error}`);
    }
  }
}
