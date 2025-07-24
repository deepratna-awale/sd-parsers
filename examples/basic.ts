import { ParserManager, getFullPrompt, getModels } from '../src';

/**
 * Basic usage example for the sd-parsers library
 */
async function main() {
  const parserManager = new ParserManager();

  // Parse multiple files
  const filenames = process.argv.slice(2);
  
  if (filenames.length === 0) {
    console.log('Usage: node basic.js <image-files...>');
    process.exit(1);
  }

  for (const filename of filenames) {
    try {
      console.log(`\n=== Processing: ${filename} ===`);
      const promptInfo = await parserManager.parse(filename);
      
      if (promptInfo) {
        displayInfo(promptInfo);
      } else {
        console.log('No metadata found in this image.');
      }
    } catch (error) {
      console.error(`Error reading file ${filename}:`, error);
    }
  }
}

function displayInfo(promptInfo: any) {
  // Models
  const models = getModels(promptInfo);
  for (const model of models) {
    console.log(`Model: ${model.name || 'Unknown'}`);
    console.log(`Model Hash: ${model.hash || 'Unknown'}`);
  }

  // Samplers
  for (const sampler of promptInfo.samplers) {
    const samplerParameters = Object.entries(sampler.parameters)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    console.log(`Sampler: ${sampler.name}`);
    console.log(`Sampler Parameters: ${samplerParameters}`);
  }

  // Combined Prompt
  console.log(`\nPrompt: ${getFullPrompt(promptInfo)}`);

  // Remaining metadata
  console.log('\nOther Metadata:');
  for (const [k, v] of Object.entries(promptInfo.metadata)) {
    console.log(`${k}: ${v}`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
