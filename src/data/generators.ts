/**
 * Enumeration of supported image generators, one for each metadata format that is understood.
 *
 * Tools that write the format of another generator (for example Forge, which writes the
 * AUTOMATIC1111 format) are reported with that generator; `PromptInfo.software` names the
 * actual tool.
 */
export enum Generators {
  AUTOMATIC1111 = 'AUTOMATIC1111',
  COMFYUI = 'ComfyUI',
  FOOOCUS = 'Fooocus',
  INVOKEAI = 'InvokeAI',
  NOVELAI = 'NovelAI',
  SWARMUI = 'SwarmUI',
  EASYDIFFUSION = 'Easy Diffusion',
  DRAWTHINGS = 'Draw Things',
  RUINED_FOOOCUS = 'RuinedFooocus',
  STABILITY_MATRIX = 'Stability Matrix',
  TENSORART = 'TensorArt',
  CIVITAI = 'Civitai',
  HF_SPACE = 'Hugging Face Space',
  DEZGO = 'Dezgo',
  KUSART = 'KusArt',
  /** No generation data, but C2PA manifests (Content Credentials) that label the image as AI made */
  C2PA = 'C2PA',
  /** No generation data, but an IPTC digital source type in the XMP metadata that labels the image as AI made */
  IPTC = 'IPTC',
  UNKNOWN = 'Unknown'
}
