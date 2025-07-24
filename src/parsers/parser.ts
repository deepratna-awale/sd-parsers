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
export abstract class Parser {
  public readonly generator: Generators = Generators.UNKNOWN;
  protected doNormalizationPass: boolean;
  protected debug: boolean;

  constructor(normalizeParameters: boolean = true, debug: boolean = false) {
    this.doNormalizationPass = normalizeParameters;
    this.debug = debug;
  }

  /**
   * Extract image generation information from the image metadata
   */
  abstract parse(parameters: Record<string, any>): Promise<PromptInfo>;

  /**
   * Apply replacement rules and basic formatting to the keys of select image metadata entries.
   * Returns a dictionary with normalized parameter values.
   */
  normalizeParameters(
    parameters: Record<string, any> | [string, any][],
    replacementRules?: ReplacementRules,
    toLowerCase: boolean = true,
    replaceWhitespace: boolean = true
  ): Record<string, any> {
    if (!this.doNormalizationPass) {
      return Array.isArray(parameters) ? Object.fromEntries(parameters) : parameters;
    }

    const rawProps = Array.isArray(parameters) ? Object.fromEntries(parameters) : { ...parameters };
    const processed: Record<string, any> = {};

    if (replacementRules) {
      for (const rule of replacementRules) {
        const [propertyKey, instruction] = rule;

        // rename field instruction
        if (typeof instruction === 'string') {
          if (propertyKey in rawProps) {
            processed[instruction] = rawProps[propertyKey];
            delete rawProps[propertyKey];
          }
        } else {
          // format field instruction
          const [formatValues, formatString] = instruction;
          if (propertyKey in rawProps) {
            const formatData: Record<string, any> = {};
            for (const key of formatValues) {
              if (key in rawProps) {
                formatData[key] = rawProps[key];
              }
            }
            
            // Simple string formatting (would need more sophisticated implementation for complex cases)
            let formatted = formatString;
            for (const [key, value] of Object.entries(formatData)) {
              formatted = formatted.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
            }
            processed[propertyKey] = formatted;
          }
        }
      }
    }

    for (let [key, value] of Object.entries(rawProps)) {
      if (toLowerCase) {
        key = key.toLowerCase();
      }

      if (replaceWhitespace) {
        key = key.replace(/\s+/g, '_');
      }

      processed[key] = value;
    }

    return processed;
  }
}

/**
 * Remove dictionary entries specified by keys from the given dictionary.
 * Ignores non-existing keys.
 * Returns an array of the actually removed keys and their corresponding values.
 */
export function popKeys(keys: string[], dictionary: Record<string, any>): [string, any][] {
  const result: [string, any][] = [];
  
  for (const key of keys) {
    if (key in dictionary) {
      result.push([key, dictionary[key]]);
      delete dictionary[key];
    }
  }
  
  return result;
}
