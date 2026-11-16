#!/usr/bin/env node

const { readFile, writeFile } = require('fs/promises');
const {
  ParserManager,
  Eagerness,
  detectFormat,
  detectVideoFormat,
  getFullPrompt,
  getFullNegativePrompt,
  getModels,
  promptInfoToDict,
  toInfotext,
  writeMetadata,
  stripMetadata,
  copyMetadata,
  readExif,
  summarizeExif,
} = require('../dist/index.js');

const USAGE = `Usage: sd-parsers [options] <image-files...>
       sd-parsers strip <image> -o <output>
       sd-parsers copy <source> <target> -o <output>
       sd-parsers to-a1111 <image> -o <output>

Reads Stable Diffusion metadata from PNG, JPEG and WEBP images and MP4, MOV, WebM and MKV videos.

Commands:
  strip     Save the image without its metadata
  copy      Save <target> with the metadata of <source>, converted to the format of <target>
  to-a1111  Save the image with its generation data rewritten as AUTOMATIC1111 parameters

Options:
  --json      Print a JSON array with one result per file
  --infotext  Print the generation data as AUTOMATIC1111 style parameters
  --exif      Also print the camera EXIF data: camera, lens, exposure, capture time, GPS
  --eager     Also read stealth metadata from the alpha channel (needs sharp)
  -h, --help  Show this help

The output may be the input file, to change it in place.

Exit codes: 0 when every file was read, 1 when any file failed or no files were given.`;

function parseArgs(argv) {
  const options = { json: false, infotext: false, exif: false, eager: false, help: false, files: [] };
  let onlyFiles = false;
  for (const arg of argv) {
    if (onlyFiles || !arg.startsWith('-') || arg === '-') {
      options.files.push(arg);
    } else if (arg === '--') {
      onlyFiles = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--infotext') {
      options.infotext = true;
    } else if (arg === '--exif') {
      options.exif = true;
    } else if (arg === '--eager') {
      options.eager = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

async function parseFile(parserManager, filename, eagerness) {
  const bytes = new Uint8Array(await readFile(filename));
  const format = detectFormat(bytes) || detectVideoFormat(bytes);
  if (!format) {
    return { format: null, promptInfo: null };
  }
  const promptInfo = await parserManager.parse(bytes, eagerness);
  const exifData = readExif(bytes);
  return { format, promptInfo, exif: exifData ? summarizeExif(exifData) : null };
}

function printText(promptInfo) {
  const software = promptInfo.software || promptInfo.generator;
  console.log(software === promptInfo.generator ? `Generator: ${software}` : `Generator: ${software} (${promptInfo.generator} format)`);
  const provenance = promptInfo.provenance;
  if (provenance) {
    const details = [provenance.vendor, provenance.digitalSourceType].filter(Boolean).join(', ');
    console.log(`Provenance: ${provenance.aiGenerated ? 'labelled as AI made' : 'labelled'} (${provenance.source}${details ? `: ${details}` : ''})`);
  }

  for (const model of getModels(promptInfo)) {
    console.log(`Model: ${model.name || 'Unknown'}`);
    if (model.hash) {
      console.log(`Model Hash: ${model.hash}`);
    }
  }

  for (const sampler of promptInfo.samplers) {
    console.log(`Sampler: ${sampler.name}`);
    const params = Object.entries(sampler.parameters)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (params) {
      console.log(`Parameters: ${params}`);
    }
  }

  if (promptInfo.width && promptInfo.height) {
    console.log(`Size: ${promptInfo.width}x${promptInfo.height}`);
  }
  for (const lora of promptInfo.loras || []) {
    const weights = [lora.weight, lora.clipWeight].filter((w) => w !== undefined).join(' / ');
    console.log(`LoRA: ${lora.name}${weights ? ` (${weights})` : ''}`);
  }

  const prompt = getFullPrompt(promptInfo);
  if (prompt) {
    console.log(`\nPrompt: ${prompt}`);
  }

  const negativePrompt = getFullNegativePrompt(promptInfo);
  if (negativePrompt) {
    console.log(`Negative Prompt: ${negativePrompt}`);
  }

  const otherMetadata = Object.entries(promptInfo.metadata);
  if (otherMetadata.length > 0) {
    console.log('\nOther Metadata:');
    for (const [key, value] of otherMetadata) {
      console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
  }
}

const EXIF_LABELS = {
  make: 'Make',
  model: 'Camera',
  lensMake: 'Lens make',
  lens: 'Lens',
  software: 'Software',
  artist: 'Artist',
  copyright: 'Copyright',
  description: 'Description',
  title: 'Title',
  comment: 'Comment',
  keywords: 'Keywords',
  rating: 'Rating',
  dateTaken: 'Taken',
  shutterSpeed: 'Shutter speed',
  fNumber: 'Aperture',
  iso: 'ISO',
  focalLength: 'Focal length',
  focalLength35mm: 'Focal length (35mm)',
  exposureBias: 'Exposure bias',
  flash: 'Flash',
  orientation: 'Orientation',
  width: 'Width',
  height: 'Height',
  gps: 'GPS',
};

function formatExifValue(key, value) {
  if (key === 'fNumber') return `f/${value}`;
  if (key === 'shutterSpeed') return `${value} s`;
  if (key === 'focalLength' || key === 'focalLength35mm') return `${value} mm`;
  if (key === 'exposureBias') return `${value > 0 ? '+' : ''}${value} EV`;
  if (key === 'flash') return value ? 'fired' : 'did not fire';
  if (key === 'keywords') return value.join(', ');
  if (key === 'gps') return `${value.latitude}, ${value.longitude}${value.altitude !== undefined ? ` (${value.altitude} m)` : ''}`;
  return String(value);
}

function printExif(exif) {
  const entries = Object.entries(EXIF_LABELS).filter(([key]) => exif[key] !== undefined && key !== 'comment');
  if (entries.length === 0) {
    console.log('\nEXIF: none');
    return;
  }
  console.log('\nEXIF:');
  for (const [key, label] of entries) {
    console.log(`  ${label}: ${formatExifValue(key, exif[key])}`);
  }
}

const COMMANDS = { strip: 1, copy: 2, 'to-a1111': 1 };

function parseCommand(argv) {
  const [command, ...rest] = argv;
  const files = [];
  let output;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '-o' || rest[i] === '--output') {
      output = rest[++i];
    } else if (rest[i].startsWith('-') && rest[i] !== '-') {
      throw new Error(`Unknown option: ${rest[i]}`);
    } else {
      files.push(rest[i]);
    }
  }
  if (files.length !== COMMANDS[command]) {
    throw new Error(`${command} takes ${COMMANDS[command] === 1 ? 'one image' : 'a source and a target image'}`);
  }
  if (!output) {
    throw new Error(`${command} needs an output file: -o <output>`);
  }
  return { command, files, output };
}

async function runCommand({ command, files, output }) {
  const [first, second] = await Promise.all(files.map(async (file) => new Uint8Array(await readFile(file))));
  let result;
  if (command === 'strip') {
    result = stripMetadata(first);
  } else if (command === 'copy') {
    result = copyMetadata(first, second);
  } else {
    const promptInfo = await new ParserManager().parse(first);
    if (!promptInfo) {
      throw new Error(`No generation data found in ${files[0]}`);
    }
    result = writeMetadata(first, toInfotext(promptInfo));
  }
  await writeFile(output, result);
  console.log(`Saved ${output}`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] in COMMANDS) {
    try {
      await runCommand(parseCommand(argv));
      return 0;
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`);
    return 1;
  }

  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (options.files.length === 0) {
    console.error(USAGE);
    return 1;
  }

  const parserManager = new ParserManager();
  const eagerness = options.eager ? Eagerness.EAGER : Eagerness.DEFAULT;
  const results = [];
  let failed = false;

  for (const file of options.files) {
    if (!options.json) {
      console.log(`\n=== ${file} ===`);
    }
    try {
      const { format, promptInfo, exif } = await parseFile(parserManager, file, eagerness);
      if (options.json) {
        results.push({
          file,
          format,
          found: promptInfo !== null,
          ...(promptInfo ? promptInfoToDict(promptInfo) : {}),
          ...(options.exif ? { exif: exif || null } : {}),
        });
      } else if (!format) {
        console.log('Not a PNG, JPEG, WEBP, MP4, MOV, WebM or MKV file');
      } else if (promptInfo && options.infotext) {
        console.log(toInfotext(promptInfo));
      } else if (promptInfo) {
        printText(promptInfo);
      } else {
        console.log('No metadata found');
      }
      if (!options.json && format && options.exif) {
        printExif(exif || {});
      }
    } catch (error) {
      failed = true;
      if (options.json) {
        results.push({ file, error: error.message });
      } else {
        console.error(`Error processing ${file}: ${error.message}`);
      }
    }
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
