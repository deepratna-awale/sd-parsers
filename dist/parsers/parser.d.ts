import { Generators, PromptInfo } from '../data';
/**
 * Type for field renaming rules: [oldKey, newKey]
 */
export type RenameField = [string, string];
/**
 * Type for field formatting rules: [oldKey, [valueKeys, formatString]]
 */
export type FormatField = [string, [string[], string]];
/**
 * Replacement rules for normalizing parameters
 */
export type ReplacementRules = (RenameField | FormatField)[];
/**
 * Abstract base class for parsers
 */
export declare abstract class Parser {
    readonly generator: Generators;
    protected doNormalizationPass: boolean;
    protected debug: boolean;
    constructor(normalizeParameters?: boolean, debug?: boolean);
    /**
     * Extract image generation information from the image metadata
     */
    abstract parse(parameters: Record<string, any>): Promise<PromptInfo>;
    /**
     * Apply replacement rules and basic formatting to the keys of select image metadata entries.
     * Returns a dictionary with normalized parameter values.
     */
    normalizeParameters(parameters: Record<string, any> | [string, any][], replacementRules?: ReplacementRules, toLowerCase?: boolean, replaceWhitespace?: boolean): Record<string, any>;
}
/**
 * Remove dictionary entries specified by keys from the given dictionary.
 * Ignores non-existing keys.
 * Returns an array of the actually removed keys and their corresponding values.
 */
export declare function popKeys(keys: string[], dictionary: Record<string, any>): [string, any][];
//# sourceMappingURL=parser.d.ts.map