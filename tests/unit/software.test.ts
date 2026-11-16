import { detectA1111Software, detectSoftware, createPromptInfo, Generators } from '../../src';

describe('detectA1111Software', () => {
  it.each([
    ['Steps: 20, Version: v1.10.1', 'Stable Diffusion WebUI'],
    ['Steps: 20, Version: classic', 'Forge Classic'],
    ['Steps: 20, Version: neo', 'Forge Neo'],
    ['Steps: 20, Version: f2.0.1v1.10.1-previous-669-gdfdcbab6', 'Forge'],
    ['Steps: 20, Version: f1.0.0v2-v1.10.1RC-latest-2498-g5120e679', 'reForge'],
    ['Steps: 20, Version: f1.3.0-v1.10.1RC-latest-1038-g19395bf9', 'EasyReforge'],
    ['Steps: 20, App: SD.Next, Version: 56a8aea', 'SD.Next'],
    ['Steps: 20, Version: Fooocus v2.5.5', 'Fooocus'],
    ['Steps: 20, Version: ComfyUI', 'ComfyUI'],
    ['Steps: 20, Civitai resources: [{"type": "checkpoint"}]', 'Civitai'],
    ['Steps: 20, ADetailer version: 24.1.0', undefined],
  ])('%s', (parameters, expected) => {
    expect(detectA1111Software(parameters)).toBe(expected);
  });
});

describe('detectSoftware', () => {
  it('names tools from their raw metadata, or falls back to the generator', () => {
    const info = (generator: Generators, raw: Record<string, any>) => createPromptInfo(generator, [], {}, raw);
    expect(detectSoftware(info(Generators.AUTOMATIC1111, { parameters: 'x', fooocus_scheme: 'a1111' }))).toBe('Fooocus');
    expect(detectSoftware(info(Generators.AUTOMATIC1111, { parameters: 'x', prompt: '{"1": {"class_type": "A"}}' }))).toBe('ComfyUI');
    expect(detectSoftware(info(Generators.AUTOMATIC1111, { parameters: 'Steps: 1' }))).toBe('AUTOMATIC1111');
    expect(detectSoftware(info(Generators.COMFYUI, { prompt: '{}' }))).toBe('ComfyUI');
  });
});
