import { Parser } from './parser';
import { Generators, PromptInfo } from '../data';
/**
 * Example stub for additional parsers
 */
export declare class DummyParser extends Parser {
    readonly generator = Generators.UNKNOWN;
    parse(parameters: Record<string, any>): Promise<PromptInfo>;
}
//# sourceMappingURL=dummy.d.ts.map