#!/usr/bin/env node

const { ParserManager, getFullPrompt, getFullNegativePrompt, getModels } = require('../dist/index.js');

async function main() {
  const filenames = process.argv.slice(2);
  
  if (filenames.length === 0) {
    console.log('Usage: sd-parsers <image-files...>');
    process.exit(1);
  }

  const parserManager = new ParserManager();

  for (const filename of filenames) {
    try {
      console.log(`\n=== ${filename} ===`);
      const promptInfo = await parserManager.parse(filename);
      
      if (promptInfo) {
        // Models
        const models = getModels(promptInfo);
        for (const model of models) {
          console.log(`Model: ${model.name || 'Unknown'}`);
          if (model.hash) {
            console.log(`Model Hash: ${model.hash}`);
          }
        }

        // Samplers
        for (const sampler of promptInfo.samplers) {
          console.log(`Sampler: ${sampler.name}`);
          const params = Object.entries(sampler.parameters)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          if (params) {
            console.log(`Parameters: ${params}`);
          }
        }

        // Prompts
        const prompt = getFullPrompt(promptInfo);
        if (prompt) {
          console.log(`\nPrompt: ${prompt}`);
        }

        const negativePrompt = getFullNegativePrompt(promptInfo);
        if (negativePrompt) {
          console.log(`Negative Prompt: ${negativePrompt}`);
        }

        // Other metadata
        const otherMetadata = Object.entries(promptInfo.metadata);
        if (otherMetadata.length > 0) {
          console.log('\nOther Metadata:');
          for (const [key, value] of otherMetadata) {
            console.log(`  ${key}: ${value}`);
          }
        }
      } else {
        console.log('No metadata found');
      }
    } catch (error) {
      console.error(`Error processing ${filename}:`, error.message);
    }
  }
}

main().catch(console.error);
