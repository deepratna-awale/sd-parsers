import { AUTOMATIC1111Parser } from './automatic1111';
import { FooocusParser } from './fooocus';
import { ComfyUIParser } from './comfyui';
import { InvokeAIParser } from './invokeai';
import { NovelAIParser } from './novelai';
/**
 * Default managed parsers in order of precedence
 */
export declare const MANAGED_PARSERS: (typeof AUTOMATIC1111Parser | typeof FooocusParser | typeof ComfyUIParser | typeof InvokeAIParser | typeof NovelAIParser)[];
export { Parser } from './parser';
export { AUTOMATIC1111Parser } from './automatic1111';
export { FooocusParser } from './fooocus';
export { ComfyUIParser } from './comfyui';
export { InvokeAIParser } from './invokeai';
export { NovelAIParser } from './novelai';
export { DummyParser } from './dummy';
//# sourceMappingURL=index.d.ts.map