import { Parser } from './parser';
import { AUTOMATIC1111Parser } from './automatic1111';
import { FooocusParser } from './fooocus';
import { ComfyUIParser } from './comfyui';
import { InvokeAIParser } from './invokeai';
import { NovelAIParser } from './novelai';
import { DummyParser } from './dummy';

/**
 * Default managed parsers in order of precedence
 */
export const MANAGED_PARSERS = [
  FooocusParser,
  AUTOMATIC1111Parser,
  ComfyUIParser,
  InvokeAIParser,
  NovelAIParser,
];

export { Parser } from './parser';
export { AUTOMATIC1111Parser } from './automatic1111';
export { FooocusParser } from './fooocus';
export { ComfyUIParser } from './comfyui';
export { InvokeAIParser } from './invokeai';
export { NovelAIParser } from './novelai';
export { DummyParser } from './dummy';
