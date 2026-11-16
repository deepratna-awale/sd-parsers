import { Parser } from './parser';
import { Generators, createPromptInfo, PromptInfo } from '../data';
import { ParserError } from '../exceptions';
import type { Provenance } from '../provenance';

/**
 * Reports images that hold no generation data but are labelled as AI made: ChatGPT, Gemini,
 * Grok, Meta AI and other services that write C2PA manifests or an IPTC digital source type.
 * Runs after the other parsers, so images with generation data keep their generator.
 */
export class ProvenanceParser extends Parser {
  public readonly generator = Generators.C2PA;

  async parse(parameters: Record<string, any>): Promise<PromptInfo> {
    const provenance: Provenance | undefined = parameters.provenance;
    if (!provenance?.aiGenerated) {
      throw new ParserError('no AI provenance label found');
    }

    const metadata: Record<string, any> = {};
    if (provenance.digitalSourceType) metadata.digital_source_type = provenance.digitalSourceType;
    if (provenance.vendor) metadata.vendor = provenance.vendor;
    const generator = provenance.source === 'C2PA' ? Generators.C2PA : Generators.IPTC;
    const promptInfo = createPromptInfo(generator, [], metadata, {});
    promptInfo.software = provenance.software ?? provenance.vendor ?? generator;
    promptInfo.provenance = provenance;
    return promptInfo;
  }
}
