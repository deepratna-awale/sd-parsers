import { ParserManager, Eagerness, AUTOMATIC1111Parser } from '../src';

/**
 * Advanced usage examples for the sd-parsers library
 */
async function main() {
  console.log('=== Advanced Usage Examples ===\n');

  // Example 1: Custom eagerness level
  console.log('1. Using EAGER metadata extraction:');
  const eagerManager = new ParserManager({ eagerness: Eagerness.EAGER });
  
  // Example 2: Debug mode
  console.log('2. Using debug mode:');
  const debugManager = new ParserManager({ debug: true });
  
  // Example 3: Custom parser selection
  console.log('3. Using only AUTOMATIC1111 parser:');
  const specificManager = new ParserManager({
    managedParsers: [AUTOMATIC1111Parser]
  });
  
  // Example 4: Disable parameter normalization
  console.log('4. Disable parameter normalization:');
  const rawManager = new ParserManager({
    normalizeParameters: false
  });

  // Example 5: Parse from Buffer
  console.log('5. Parse from Buffer:');
  try {
    const fs = await import('fs/promises');
    const imageBuffer = await fs.readFile('./examples/test-image.png').catch(() => null);
    if (imageBuffer) {
      const result = await eagerManager.parse(imageBuffer);
      console.log('Parsed from buffer:', result ? 'Success' : 'No metadata found');
    } else {
      console.log('No test image found, skipping buffer example');
    }
  } catch (error) {
    console.log('Buffer parsing example failed:', error);
  }

  console.log('\nAdvanced examples completed!');
}

if (require.main === module) {
  main().catch(console.error);
}
