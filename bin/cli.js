#!/usr/bin/env node

const { readFile } = require('fs/promises');
const {
  ParserManager,
  Eagerness,
  detectFormat,
  getFullPrompt,
  getFullNegativePrompt,
  getModels,
  promptInfoToDict,
} = require('../dist/index.js');

const USAGE = `Usage: sd-parsers [options] <image-files...>

Reads Stable Diffusion metadata from PNG, JPEG and WEBP images.

Options:
  --json      Print a JSON array with one result per file
  --eager     Also read stealth metadata from the alpha channel (needs sharp)
  -h, --help  Show this help

Exit codes: 0 when every file was read, 1 when any file failed or no files were given.`;

function parseArgs(argv) {
  const options = { json: false, eager: false, help: false, files: [] };
  let onlyFiles = false;
  for (const arg of argv) {
    if (onlyFiles || !arg.startsWith('-') || arg === '-') {
      options.files.push(arg);
    } else if (arg === '--') {
      onlyFiles = true;
    } else if (arg === '--json') {
      options.json = true;
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
  const format = detectFormat(bytes);
  if (!format) {
    return { format: null, promptInfo: null };
  }
  const promptInfo = await parserManager.parse(bytes, eagerness);
  return { format, promptInfo };
}

function printText(promptInfo) {
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

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
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
      const { format, promptInfo } = await parseFile(parserManager, file, eagerness);
      if (options.json) {
        results.push({
          file,
          format,
          found: promptInfo !== null,
          ...(promptInfo ? promptInfoToDict(promptInfo) : {}),
        });
      } else if (!format) {
        console.log('Not a PNG, JPEG or WEBP image');
      } else if (promptInfo) {
        printText(promptInfo);
      } else {
        console.log('No metadata found');
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
