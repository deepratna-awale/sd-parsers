# SD-Parsers API

A REST API for extracting metadata from AI-generated images. This API provides endpoints to analyze images created by popular Stable Diffusion tools.

## 🚀 Quick Start

### Demo Webpage
Visit the root URL of your API server to access an interactive demo:
- **Development**: `http://localhost:3000`
- **Production**: `https://your-vercel-deployment.vercel.app`

The demo provides a user-friendly interface for:
- 📤 **File Upload**: Drag and drop or select image files
- 🌐 **URL Parsing**: Analyze images from direct URLs
- ⚙️ **Configuration**: Adjust API endpoints and eagerness levels
- 📊 **Results**: View extracted metadata in a formatted display

### API Documentation
For JSON API documentation, visit `/api` endpoint.

## Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://your-vercel-deployment.vercel.app`

## Endpoints

### GET /

Serves the interactive demo webpage.

### GET /api

Returns API documentation and available endpoints.

**Response:**
```json
{
  "name": "SD-Parsers API",
  "description": "Extract metadata from AI-generated images",
  "version": "1.0.0",
  "endpoints": { ... },
  "supportedFormats": ["JPEG", "PNG", "WebP", "BMP", "TIFF"],
  "supportedGenerators": ["Automatic1111", "ComfyUI", "Fooocus", "InvokeAI", "NovelAI"]
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "sd-parsers-api",
  "version": "1.0.0",
  "timestamp": "2025-07-25T12:00:00.000Z"
}
```

### POST /parse

Parse image metadata from an uploaded file.

**Content-Type:** `multipart/form-data`

**Parameters:**
- `image` (file, required): Image file to analyze
- `eagerness` (string, optional): Parsing eagerness level (`fast`, `default`, `eager`)

**Example using curl:**
```bash
curl -X POST \
  -F "image=@your-image.png" \
  -F "eagerness=default" \
  http://localhost:3000/parse
```

**Example using JavaScript:**
```javascript
const formData = new FormData();
formData.append('image', imageFile);
formData.append('eagerness', 'default');

const response = await fetch('/parse', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

**Success Response:**
```json
{
  "success": true,
  "data": {
    "prompts": [
      {
        "value": "a beautiful landscape, masterpiece",
        "isNegative": false
      }
    ],
    "parameters": {
      "sampler": "DPM++ 2M Karras",
      "steps": 20,
      "cfgScale": 7,
      "seed": 1234567890,
      "size": {
        "width": 512,
        "height": 512
      }
    },
    "generator": "AUTOMATIC1111"
  },
  "metadata": {
    "filename": "image.png",
    "size": 1048576,
    "mimetype": "image/png",
    "eagerness": "default"
  }
}
```

**No Metadata Response:**
```json
{
  "success": false,
  "message": "No metadata found in the image",
  "data": null,
  "metadata": {
    "filename": "image.png",
    "size": 1048576,
    "mimetype": "image/png",
    "eagerness": "default"
  }
}
```

### POST /parse/url

Parse image metadata from an image URL.

**Content-Type:** `application/json`

**Parameters:**
```json
{
  "url": "https://example.com/image.png",
  "eagerness": "default"
}
```

**Example:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/image.png","eagerness":"default"}' \
  http://localhost:3000/parse/url
```

### GET /parsers

List all supported AI image generators.

**Response:**
```json
{
  "parsers": [
    {
      "name": "Automatic1111",
      "description": "Stable Diffusion WebUI by AUTOMATIC1111",
      "generator": "AUTOMATIC1111"
    },
    // ... other parsers
  ]
}
```

### GET /eagerness

List available eagerness levels for parsing.

**Response:**
```json
{
  "levels": [
    {
      "name": "fast",
      "value": 0,
      "description": "Cut some corners to save time"
    },
    {
      "name": "default",
      "value": 1,
      "description": "Try to ensure all metadata is read (recommended)"
    },
    {
      "name": "eager",
      "value": 2,
      "description": "Include additional methods to retrieve metadata (computationally expensive)"
    }
  ]
}
```

## Eagerness Levels

- **fast**: Faster processing but may miss some metadata
- **default**: Balanced approach (recommended)  
- **eager**: Thorough processing but slower

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

**Common HTTP Status Codes:**
- `400`: Bad Request (invalid parameters, unsupported file type, etc.)
- `404`: Not Found (invalid endpoint)
- `500`: Internal Server Error

## File Size Limits

- Maximum file size: 50MB
- Supported formats: JPEG, PNG, WebP, BMP, TIFF

## Rate Limiting

Currently no rate limiting is implemented, but it may be added in future versions.

## Examples

See the `examples/` directory for complete usage examples in different programming languages.

## Deployment

### Local Development

```bash
npm install
npm run build
npm start
```

### Vercel Deployment

1. Push your code to a GitHub repository
2. Connect the repository to Vercel
3. Vercel will automatically detect the configuration and deploy

The `vercel.json` configuration file is already set up for optimal deployment.

## Support

For issues and questions, please check the main repository: https://github.com/deepratna-awale/sd-parsers
