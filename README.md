# SD-Parsers API

A REST API for extracting metadata from AI-generated images. This API provides endpoints to analyze images created by popular Stable Diffusion tools and extract generation parameters, prompts, and other metadata.

Try it out yourself: https://sd-parsers.vercel.app/


## 🚀 Quick Start

### Try the Demo
Start the server and visit the interactive demo webpage:

```bash
npm install
npm run build
npm start
```

Then open http://localhost:3000 in your browser for a user-friendly interface to test the API.

### API Usage
```javascript
// Upload file
const formData = new FormData();
formData.append('image', imageFile);
const response = await fetch('/parse', { method: 'POST', body: formData });

// Parse from URL
const response = await fetch('/parse/url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com/image.png' })
});
```

## 🎯 Features

- **📤 File Upload**: Parse metadata from uploaded image files
- **🌐 URL Parsing**: Analyze images from direct URLs
- **🤖 Multi-Generator Support**: Automatic1111, ComfyUI, Fooocus, InvokeAI, NovelAI
- **🖼️ Format Support**: JPEG, PNG, WebP, BMP, TIFF
- **⚙️ Configurable Processing**: Three eagerness levels for speed vs accuracy
- **🌐 Interactive Demo**: Built-in web interface for testing
- **🔍 Comprehensive Extraction**: Prompts, parameters, seeds, and more

## 📋 Supported Generators

| Generator | Status | Metadata Types |
|-----------|--------|----------------|
| **Automatic1111** | ✅ Full Support | Prompts, parameters, models, settings |
| **ComfyUI** | ✅ Full Support | Workflow, prompts, node parameters |
| **Fooocus** | ✅ Full Support | Prompts, styles, performance settings |
| **InvokeAI** | ✅ Full Support | Generation parameters, model info |
| **NovelAI** | ✅ Full Support | Prompts, quality tags, parameters |

## 🛠️ Installation & Setup

### Development
```bash
# Clone the repository
git clone https://github.com/deepratna-awale/sd-parsers.git
cd sd-parsers

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

### Production
```bash
# Build for production
npm run build

# Start with PM2 or similar
node dist/server.js
```

## 📚 API Documentation

### Endpoints
- `GET /` - Interactive demo webpage
- `GET /api` - API documentation (JSON)
- `GET /health` - Health check
- `POST /parse` - Parse uploaded image file
- `POST /parse/url` - Parse image from URL
- `GET /parsers` - List supported generators
- `GET /eagerness` - List processing levels

### Processing Levels
- **Fast**: Quick processing, may miss some metadata
- **Default**: Recommended balance (default)
- **Eager**: Thorough analysis, slower but comprehensive

For complete API documentation, see [API.md](./API.md).

## 🖥️ Demo Interface

The built-in demo provides:
- **Drag & Drop Upload**: Easy file selection
- **Real-time Status**: API connectivity monitoring
- **Formatted Results**: Organized metadata display
- **Configuration**: Adjustable API endpoints
- **Examples**: Sample URLs for testing

See [DEMO.md](./DEMO.md) for detailed usage instructions.

## 🔧 Examples

Check the `/examples` directory for:
- `api-file-upload.ts` - Node.js file upload example
- `api-url-parse.ts` - URL parsing example

## 📦 Dependencies

### Runtime
- **Express**: Web server framework
- **Multer**: File upload handling
- **Sharp**: Image processing
- **CORS**: Cross-origin resource sharing
- **exifr**: EXIF metadata extraction
- **png-chunks-extract**: PNG metadata parsing

### Development
- **TypeScript**: Type-safe development
- **@types/**: Type definitions

## 🌐 Deployment

### Vercel
The project includes `vercel.json` for easy deployment:

```bash
# Deploy to Vercel
vercel --prod
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- [exifr](https://github.com/MikeKovarik/exifr) for EXIF parsing
- [Sharp](https://sharp.pixelplumbing.com/) for image processing
- The Stable Diffusion community for metadata standards

## 📈 Roadmap

- [ ] Additional generator support
- [ ] Batch processing endpoints
- [ ] Metadata validation
- [ ] Export functionality
- [ ] Advanced filtering options

## 🐛 Issues & Support

- Report bugs via [GitHub Issues](https://github.com/deepratna-awale/sd-parsers/issues)
- Check existing issues before creating new ones
- Include sample images when reporting parsing issues
