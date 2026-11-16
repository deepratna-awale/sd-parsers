import { Parser } from './parser';
import { AUTOMATIC1111Parser } from './automatic1111';
import { FooocusParser } from './fooocus';
import { ComfyUIParser } from './comfyui';
import { InvokeAIParser } from './invokeai';
import { NovelAIParser } from './novelai';
import { DummyParser } from './dummy';
import { SwarmUIParser } from './swarmui';
import { EasyDiffusionParser } from './easyDiffusion';
import { DrawThingsParser } from './drawThings';
import { RuinedFooocusParser } from './ruinedFooocus';
import { StabilityMatrixParser } from './stabilityMatrix';
import { TensorArtParser } from './tensorart';
import { CivitaiParser } from './civitai';
import { HFSpaceParser } from './hfSpace';
import { DezgoParser } from './dezgo';
import { KusArtParser } from './kusart';

/**
 * Default managed parsers in order of precedence
 */
export const MANAGED_PARSERS = [
  SwarmUIParser,
  RuinedFooocusParser,
  HFSpaceParser,
  EasyDiffusionParser,
  DrawThingsParser,
  DezgoParser,
  KusArtParser,
  TensorArtParser,
  StabilityMatrixParser,
  CivitaiParser,
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
export { SwarmUIParser } from './swarmui';
export { EasyDiffusionParser } from './easyDiffusion';
export { DrawThingsParser } from './drawThings';
export { RuinedFooocusParser } from './ruinedFooocus';
export { StabilityMatrixParser } from './stabilityMatrix';
export { TensorArtParser } from './tensorart';
export { CivitaiParser } from './civitai';
export { HFSpaceParser } from './hfSpace';
export { DezgoParser } from './dezgo';
export { KusArtParser } from './kusart';
