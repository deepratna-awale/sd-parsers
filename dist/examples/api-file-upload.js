"use strict";
// Example: Upload and parse an image file using Node.js
// Usage: node dist/examples/api-file-upload.js path/to/image.png
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const API_BASE = 'http://localhost:3000';
// Helper function to determine content type from file extension
function getContentType(filePath) {
    const ext = (0, path_1.extname)(filePath).toLowerCase();
    switch (ext) {
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.webp': return 'image/webp';
        case '.bmp': return 'image/bmp';
        case '.tiff':
        case '.tif': return 'image/tiff';
        default: return 'application/octet-stream';
    }
}
async function parseImageFile(imagePath, eagerness = 'default') {
    try {
        // Check if file exists
        try {
            (0, fs_1.statSync)(imagePath);
        }
        catch (error) {
            throw new Error(`File not found: ${imagePath}`);
        }
        // Read file as buffer
        const fileBuffer = await (0, promises_1.readFile)(imagePath);
        // Create form data using the newer fetch FormData API available in Node.js 18+
        const formData = new FormData();
        // Create a Blob from the buffer
        const fileBlob = new Blob([new Uint8Array(fileBuffer)], {
            type: getContentType(imagePath)
        });
        formData.append('image', fileBlob, (0, path_1.basename)(imagePath));
        formData.append('eagerness', eagerness);
        // Make the API request
        const response = await fetch(`${API_BASE}/parse`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.success) {
            console.log('✅ Successfully parsed image metadata:');
            console.log(JSON.stringify(result.data, null, 2));
            if (result.data.prompts && result.data.prompts.length > 0) {
                console.log('\n📝 Prompts found:');
                result.data.prompts.forEach((prompt, index) => {
                    console.log(`${index + 1}. ${prompt.isNegative ? '[NEGATIVE] ' : ''}${prompt.value}`);
                });
            }
            if (result.data.parameters) {
                console.log('\n⚙️  Generation Parameters:');
                const params = result.data.parameters;
                if (params.sampler)
                    console.log(`Sampler: ${params.sampler}`);
                if (params.steps)
                    console.log(`Steps: ${params.steps}`);
                if (params.cfgScale)
                    console.log(`CFG Scale: ${params.cfgScale}`);
                if (params.seed)
                    console.log(`Seed: ${params.seed}`);
                if (params.size)
                    console.log(`Size: ${params.size.width}x${params.size.height}`);
            }
        }
        else {
            console.log('❌ No metadata found in the image');
        }
        console.log(`\n📊 File info: ${result.metadata.filename} (${Math.round(result.metadata.size / 1024)}KB)`);
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
// Check if file path is provided
const imagePath = process.argv[2];
const eagerness = process.argv[3] || 'default';
if (!imagePath) {
    console.log('Usage: node dist/examples/api-file-upload.js <image-path> [eagerness]');
    console.log('Eagerness levels: fast, default, eager');
    process.exit(1);
}
parseImageFile(imagePath, eagerness);
//# sourceMappingURL=api-file-upload.js.map