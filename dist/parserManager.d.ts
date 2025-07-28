import sharp from 'sharp';
import { PromptInfo } from './data';
import { Eagerness } from './extractors';
import { Parser } from './parsers';
/**
 * Input types that can be parsed
 */
export type ParseInput = string | Buffer | sharp.Sharp;
/**
 * Provides a simple way of testing multiple parser modules against a given image
 */
export declare class ParserManager {
    private eagerness;
    private debug;
    private managedParsers;
    constructor(options?: {
        debug?: boolean;
        eagerness?: Eagerness;
        managedParsers?: (new (normalizeParameters?: boolean, debug?: boolean) => Parser)[];
        normalizeParameters?: boolean;
    });
    /**
     * Try to extract image generation parameters from the given image.
     */
    parse(input: ParseInput, eagerness?: Eagerness): Promise<PromptInfo | null>;
}
//# sourceMappingURL=parserManager.d.ts.map