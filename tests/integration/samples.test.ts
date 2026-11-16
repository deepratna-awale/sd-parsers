/**
 * Parses real images from many generators (see tests/resources/samples/README.md).
 */
import path from 'path';
import { ParserManager, PromptInfo, getFullPrompt, getFullNegativePrompt, toInfotext } from '../../src';

const SAMPLES = path.join(__dirname, '../resources/samples');

/** generator and software of each sample, or null when it has no generation data */
const EXPECTED: Record<string, [string, string] | null> = {
  "png/civitai-lora-hires.png": ["Civitai", "Civitai"],
  "png/civitai-lora.png": ["AUTOMATIC1111", "Civitai"],
  "png/comfyui-anima.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-comfy-image-saver.png": ["AUTOMATIC1111", "ComfyUI"],
  "png/comfyui-comfyroll-lora.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-comfyroll.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-easy-lora-stack.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-easy-lora-switcher.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-efficiency-lora.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-group-nodes.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-hires.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-lora-manager.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-lora-model-only.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-lora.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-low-denoise.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-rgthree-lora-loader-stack.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-rgthree-lora-tag.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-rgthree-power-lora-loader.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-rgthree.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-save-image-extended.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-saveimage-plus.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui-saveimagewithmetadata.png": ["AUTOMATIC1111", "ComfyUI"],
  "png/comfyui-upscale.png": ["ComfyUI", "ComfyUI"],
  "png/comfyui.png": ["ComfyUI", "ComfyUI"],
  "png/dezgo-lora.png": ["Dezgo", "Dezgo"],
  "png/dezgo.png": ["Dezgo", "Dezgo"],
  "png/draw-things-lora.png": ["Draw Things", "Draw Things"],
  "png/easy-diffusion-hires.png": ["Easy Diffusion", "Easy Diffusion"],
  "png/easy-diffusion-lora.png": ["Easy Diffusion", "Easy Diffusion"],
  "png/easy-diffusion-single-lora.png": ["Easy Diffusion", "Easy Diffusion"],
  "png/easy-diffusion.png": ["Easy Diffusion", "Easy Diffusion"],
  "png/easy-reforge.png": ["AUTOMATIC1111", "EasyReforge"],
  "png/empty.png": null,
  "png/fooocus-a1111.png": ["AUTOMATIC1111", "Fooocus"],
  "png/fooocus.png": ["Fooocus", "Fooocus"],
  "png/forge-classic-adetailer.png": ["AUTOMATIC1111", "Forge Classic"],
  "png/forge-classic-en.png": ["AUTOMATIC1111", "Forge Classic"],
  "png/forge-classic-hires.png": ["AUTOMATIC1111", "Forge Classic"],
  "png/forge-classic-lora.png": ["AUTOMATIC1111", "Forge Classic"],
  "png/forge-classic-lora_with_comma.png": ["AUTOMATIC1111", "Forge Classic"],
  "png/forge-classic.png": ["AUTOMATIC1111", "Forge Classic"],
  "png/forge-neo-adetailer.png": ["AUTOMATIC1111", "Forge Neo"],
  "png/forge-neo-hires.png": ["AUTOMATIC1111", "Forge Neo"],
  "png/forge-neo.png": ["AUTOMATIC1111", "Forge Neo"],
  "png/forge.png": ["AUTOMATIC1111", "Forge"],
  "png/gimp-en.png": null,
  "png/gimp.png": null,
  "png/huggingface-space-upscale.png": ["Hugging Face Space", "Hugging Face Space"],
  "png/huggingface-space.png": ["Hugging Face Space", "Hugging Face Space"],
  "png/invokeai-en.png": ["InvokeAI", "InvokeAI"],
  "png/invokeai-hires.png": ["InvokeAI", "InvokeAI"],
  "png/invokeai-lora.png": ["InvokeAI", "InvokeAI"],
  "png/invokeai.png": ["InvokeAI", "InvokeAI"],
  "png/krea2.png": ["ComfyUI", "ComfyUI"],
  "png/kusart-anima.png": ["KusArt", "KusArt"],
  "png/kusart-easy-3styles.png": ["KusArt", "KusArt"],
  "png/kusart-krea2.png": ["KusArt", "KusArt"],
  "png/kusart-xl.png": ["KusArt", "KusArt"],
  "png/novelai-curated.png": ["NovelAI", "NovelAI"],
  "png/novelai-full-3char.png": ["NovelAI", "NovelAI"],
  "png/novelai-full.png": ["NovelAI", "NovelAI"],
  "png/novelai-ref.png": ["NovelAI", "NovelAI"],
  "png/novelai-v3.png": ["NovelAI", "NovelAI"],
  "png/novelai-v5-full-i2i.png": ["NovelAI", "NovelAI"],
  "png/novelai-v5-full.png": ["NovelAI", "NovelAI"],
  "png/reforge-hires.png": ["AUTOMATIC1111", "reForge"],
  "png/reforge.png": ["AUTOMATIC1111", "reForge"],
  "png/ruined-fooocus-lora.png": ["RuinedFooocus", "RuinedFooocus"],
  "png/ruined-fooocus.png": ["RuinedFooocus", "RuinedFooocus"],
  "png/sd-next-en.png": ["AUTOMATIC1111", "SD.Next"],
  "png/sd-next-hires.png": ["AUTOMATIC1111", "SD.Next"],
  "png/sd-next-lora.png": ["AUTOMATIC1111", "SD.Next"],
  "png/sd-next.png": ["AUTOMATIC1111", "SD.Next"],
  "png/sd-webui-hires.png": ["AUTOMATIC1111", "Stable Diffusion WebUI"],
  "png/sd-webui.png": ["AUTOMATIC1111", "Stable Diffusion WebUI"],
  "png/stability-matrix-hires.png": ["Stability Matrix", "Stability Matrix"],
  "png/stability-matrix-lora.png": ["Stability Matrix", "Stability Matrix"],
  "png/stability-matrix-upscale.png": ["Stability Matrix", "Stability Matrix"],
  "png/stability-matrix.png": ["Stability Matrix", "Stability Matrix"],
  "png/swarmui-hires.png": ["SwarmUI", "SwarmUI"],
  "png/swarmui-lora.png": ["SwarmUI", "SwarmUI"],
  "png/swarmui-upscale.png": ["SwarmUI", "SwarmUI"],
  "png/swarmui.png": ["SwarmUI", "SwarmUI"],
  "png/tensorart-lora.png": ["TensorArt", "TensorArt"],
  "png/tensorart.png": ["TensorArt", "TensorArt"],
  "jpg/civitai-hires.jpg": ["Civitai", "Civitai"],
  "jpg/civitai-lora-hires.jpg": ["Civitai", "Civitai"],
  "jpg/civitai-lora.jpg": ["AUTOMATIC1111", "Civitai"],
  "jpg/civitai-upscale.jpg": ["Civitai", "Civitai"],
  "jpg/civitai.jpeg": ["AUTOMATIC1111", "Civitai"],
  "jpg/comfyui-comfy-image-saver-with-workflow.jpeg": ["AUTOMATIC1111", "ComfyUI"],
  "jpg/comfyui-comfy-image-saver.jpeg": ["AUTOMATIC1111", "ComfyUI"],
  "jpg/comfyui-save-image-extended.jpeg": ["ComfyUI", "ComfyUI"],
  "jpg/comfyui-saveimage-plus.jpg": ["ComfyUI", "ComfyUI"],
  "jpg/comfyui-saveimagewithmetadata.jpeg": ["AUTOMATIC1111", "AUTOMATIC1111"],
  "jpg/dezgo-long.jpg": ["Dezgo", "Dezgo"],
  "jpg/dezgo.jpg": ["Dezgo", "Dezgo"],
  "jpg/easy-diffusion.jpeg": ["Easy Diffusion", "Easy Diffusion"],
  "jpg/empty.jpg": null,
  "jpg/fooocus-a1111.jpg": ["AUTOMATIC1111", "Fooocus"],
  "jpg/fooocus.jpg": ["Fooocus", "Fooocus"],
  "jpg/forge-classic-hires.jpeg": ["AUTOMATIC1111", "Forge Classic"],
  "jpg/forge-classic.jpeg": ["AUTOMATIC1111", "Forge Classic"],
  "jpg/forge-neo.jpeg": ["AUTOMATIC1111", "Forge Neo"],
  "jpg/gimp.jpg": null,
  "jpg/reforge-hires.jpeg": ["AUTOMATIC1111", "reForge"],
  "jpg/reforge.jpeg": ["AUTOMATIC1111", "reForge"],
  "jpg/sd-next-hires.jpg": ["AUTOMATIC1111", "SD.Next"],
  "jpg/sd-next.jpg": ["AUTOMATIC1111", "SD.Next"],
  "jpg/sd-webui.jpg": ["AUTOMATIC1111", "Stable Diffusion WebUI"],
  "jpg/swarmui.jpg": ["SwarmUI", "SwarmUI"],
  "webp/comfyui-animated-webp.webp": ["ComfyUI", "ComfyUI"],
  "webp/comfyui-comfy-image-saver.webp": ["AUTOMATIC1111", "ComfyUI"],
  "webp/comfyui-save-image-extended.webp": ["ComfyUI", "ComfyUI"],
  "webp/comfyui-saveimage-plus.webp": ["ComfyUI", "ComfyUI"],
  "webp/comfyui-saveimagewithmetadata-lora.webp": ["AUTOMATIC1111", "AUTOMATIC1111"],
  "webp/comfyui-saveimagewithmetadata.webp": ["AUTOMATIC1111", "AUTOMATIC1111"],
  "webp/dezgo-long.webp": ["Dezgo", "Dezgo"],
  "webp/dezgo.webp": ["Dezgo", "Dezgo"],
  "webp/easy-diffusion-lora.webp": ["Easy Diffusion", "Easy Diffusion"],
  "webp/easy-diffusion-single-lora.webp": ["Easy Diffusion", "Easy Diffusion"],
  "webp/empty.webp": null,
  "webp/fooocus.webp": ["Fooocus", "Fooocus"],
  "webp/forge-classic-hires.webp": ["AUTOMATIC1111", "Forge Classic"],
  "webp/forge-classic.webp": ["AUTOMATIC1111", "Forge Classic"],
  "webp/forge-neo.webp": ["AUTOMATIC1111", "Forge Neo"],
  "webp/gimp.webp": null,
  "webp/novelai-curated.webp": ["NovelAI", "NovelAI"],
  "webp/novelai-full-3char.webp": ["NovelAI", "NovelAI"],
  "webp/novelai-v3.webp": ["NovelAI", "NovelAI"],
  "webp/novelai-v5-full.webp": ["NovelAI", "NovelAI"],
  "webp/reforge-hires.webp": ["AUTOMATIC1111", "reForge"],
  "webp/sd-next-hires.webp": ["AUTOMATIC1111", "SD.Next"],
  "webp/sd-next.webp": ["AUTOMATIC1111", "SD.Next"],
  "webp/sd-webui.webp": ["AUTOMATIC1111", "Stable Diffusion WebUI"],
  "webp/swarmui.webp": ["SwarmUI", "SwarmUI"],
  "mkv/comfyui-wan2.2.mkv": ["ComfyUI", "ComfyUI"],
  "mkv/forge-neo-wan2.2.mkv": ["AUTOMATIC1111", "Forge Neo"],
  "mov/comfyui-mmh3.mov": null,
  "mp4/comfyui-mmh3-no-metadata.mp4": null,
  "mp4/comfyui-mmh3.mp4": ["ComfyUI", "ComfyUI"],
  "mp4/comfyui-wan2.2.mp4": ["ComfyUI", "ComfyUI"],
  "mp4/forge-neo-wan2.2.mp4": ["AUTOMATIC1111", "Forge Neo"],
  "webm/comfyui-mmh3.webm": ["ComfyUI", "ComfyUI"],
  "webm/comfyui-wan2.2.webm": ["ComfyUI", "ComfyUI"],
  "vendor/mp4/gemini-veo3.1-lite.mp4": ["C2PA", "Gemini"],
  "vendor/mp4/grok-imagine2.mp4": ["C2PA", "Grok Imagine"],
  "vendor/mp4/muse.mp4": ["IPTC", "Meta AI"],
  "vendor/jpg/gemini_3.1pro-latest.jpg": ["C2PA", "Gemini"],
  "vendor/jpg/grok-imagine2.jpg": ["C2PA", "Grok Imagine"],
  "vendor/jpg/muse-free.jpg": ["IPTC", "IPTC"],
  "vendor/png/chatgpt-image2-latest.png": ["C2PA", "ChatGPT"],
  "vendor/png/chatgpt-image2.png": ["C2PA", "ChatGPT"],
  "vendor/png/gemini_3.1pro.png": ["C2PA", "Gemini"],
  "vendor/png/gemini_unknown.png": ["C2PA", "Gemini"],
  "vendor/webp/muse.webp": ["IPTC", "Meta AI"],

};

describe('Sample images', () => {
  const parserManager = new ParserManager();

  it.each(Object.entries(EXPECTED))('%s', async (file, expected) => {
    const result = await parserManager.parse(path.join(SAMPLES, file));
    expect(result && [result.generator, result.software]).toEqual(expected);
    if (result && !file.startsWith('vendor/')) {
      expect(getFullPrompt(result)).toBeTruthy();
    }
  });

  it('reads UTF-8 text from NovelAI WEBP files without stray characters', async () => {
    const result = (await parserManager.parse(path.join(SAMPLES, 'webp/novelai-curated.webp'))) as PromptInfo;
    expect(getFullPrompt(result)).toMatch(/^1girl, solo, hatsune miku, #テスト/);
  });

  it('reads the little-endian UserComment of CivitAI files', async () => {
    const result = (await parserManager.parse(path.join(SAMPLES, 'jpg/civitai-lora.jpg'))) as PromptInfo;
    expect(result.samplers[0].name).toBe('Euler a');
    expect(getFullPrompt(result)).toMatch(/^perfect eyes, 1girl/);
  });

  it('reads custom samplers and text nodes in ComfyUI graphs', async () => {
    const anima = (await parserManager.parse(path.join(SAMPLES, 'png/comfyui-anima.png'))) as PromptInfo;
    expect(anima.samplers[0].parameters).toMatchObject({ cfg_scale: 5, seed: 662066908990052 });
    expect(getFullNegativePrompt(anima)).toMatch(/^bad quality/);

    const comfyroll = (await parserManager.parse(path.join(SAMPLES, 'png/comfyui-comfyroll.png'))) as PromptInfo;
    expect(getFullPrompt(comfyroll)).toMatch(/^general, masterpiece/);
  });

  it('reads the generation settings of the new generators', async () => {
    const swarm = (await parserManager.parse(path.join(SAMPLES, 'png/swarmui.png'))) as PromptInfo;
    expect(swarm.samplers[0]).toMatchObject({ name: 'euler_ancestral', parameters: { steps: 20, cfg_scale: 7 } });

    const dezgo = (await parserManager.parse(path.join(SAMPLES, 'webp/dezgo.webp'))) as PromptInfo;
    expect(getFullPrompt(dezgo)).toBe('general, masterpiece, \n1girl, solo, hatsune miku, double v, #テスト');

    const tensorart = (await parserManager.parse(path.join(SAMPLES, 'png/tensorart.png'))) as PromptInfo;
    expect(getFullPrompt(tensorart)).toMatch(/#テスト$/);
    expect(tensorart.samplers[0].parameters.seed).not.toBe(-1);
  });

  it.each([
    ['png/comfyui-lora.png', [{ name: 'LECO_GoodHands.safetensors', weight: -0.8, clipWeight: -0.7 }, { name: 'LECO_BadHands.safetensors', weight: 0.9, clipWeight: 0.8 }]],
    ['png/forge-classic-lora.png', [{ name: 'LECO_GoodHands', weight: -0.8, hash: 'fe3806374a03' }, { name: 'LECO_BadHands', weight: 0.8, hash: '37c8880f409c' }]],
    ['png/comfyui-rgthree-power-lora-loader.png', [{ name: 'LECO_GoodHands.safetensors', weight: -0.5 }]],
    ['png/easy-diffusion-lora.png', [{ name: 'LECO_GoodHands', weight: -0.72 }]],
    ['png/invokeai-lora.png', [{ name: 'LECO_GoodHands', weight: -0.8 }]],
    ['png/draw-things-lora.png', [{ name: 'surprised_look_slider_lora_f16.ckpt', weight: 0.3 }]],
  ])('reads the LoRAs of %s', async (file, expected) => {
    const result = (await parserManager.parse(path.join(SAMPLES, file))) as PromptInfo;
    expect(result.loras).toEqual(expect.arrayContaining(expected.map(lora => expect.objectContaining(lora))));
  });

  it('records the generation size', async () => {
    const result = (await parserManager.parse(path.join(SAMPLES, 'png/comfyui-lora.png'))) as PromptInfo;
    expect([result.width, result.height]).toEqual([1024, 1024]);
  });

  it('writes AUTOMATIC1111 style text for every sample', async () => {
    for (const [file, expected] of Object.entries(EXPECTED)) {
      if (!expected || file.startsWith('vendor/')) continue;
      const result = (await parserManager.parse(path.join(SAMPLES, file))) as PromptInfo;
      const text = toInfotext(result);
      expect(text.split('\n')[0]).toBeTruthy();
      expect(text).not.toContain('[object Object]');
    }
  });
});
