// Example: Parse image from URL
// Usage: node dist/examples/api-url-parse.js https://example.com/image.png

const API_BASE = 'http://localhost:3000';

async function parseImageFromURL(imageUrl: string, eagerness: string = 'default') {
  try {
    // Make the API request
    const response = await fetch(`${API_BASE}/parse/url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: imageUrl,
        eagerness: eagerness
      })
    });

    const result = await response.json() as any;
    
    if (result.success) {
      console.log('✅ Successfully parsed image metadata:');
      console.log(JSON.stringify(result.data, null, 2));
      
      if (result.data.prompts && result.data.prompts.length > 0) {
        console.log('\n📝 Prompts found:');
        result.data.prompts.forEach((prompt: any, index: number) => {
          console.log(`${index + 1}. ${prompt.isNegative ? '[NEGATIVE] ' : ''}${prompt.value}`);
        });
      }
      
      if (result.data.parameters) {
        console.log('\n⚙️  Generation Parameters:');
        const params = result.data.parameters;
        if (params.sampler) console.log(`Sampler: ${params.sampler}`);
        if (params.steps) console.log(`Steps: ${params.steps}`);
        if (params.cfgScale) console.log(`CFG Scale: ${params.cfgScale}`);
        if (params.seed) console.log(`Seed: ${params.seed}`);
        if (params.size) console.log(`Size: ${params.size.width}x${params.size.height}`);
      }
    } else {
      console.log('❌ No metadata found in the image');
    }
    
    console.log(`\n📊 Image URL: ${result.metadata.url}`);
    console.log(`📊 File size: ${Math.round(result.metadata.size / 1024)}KB`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Check if URL is provided
const imageUrl = process.argv[2];
const eagerness = process.argv[3] || 'default';

if (!imageUrl) {
  console.log('Usage: node dist/examples/api-url-parse.js <image-url> [eagerness]');
  console.log('Eagerness levels: fast, default, eager');
  console.log('Example: node dist/examples/api-url-parse.js https://example.com/image.png default');
  process.exit(1);
}

parseImageFromURL(imageUrl, eagerness);
