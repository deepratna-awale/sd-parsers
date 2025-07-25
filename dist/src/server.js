"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const multer_1 = __importDefault(require("multer"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const index_1 = require("./index");
const app = (0, express_1.default)();
// Swagger definition
const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'SD-Parsers API',
        version: '1.0.0',
        description: 'Extract metadata from AI-generated images (Stable Diffusion)',
    },
    servers: [
        { url: 'http://localhost:3000', description: 'Local server' },
        { url: '/', description: 'Production' }
    ],
};
const swaggerOptions = {
    swaggerDefinition,
    apis: ['./src/server.ts'], // You can add more files for endpoint docs
};
const swaggerSpec = (0, swagger_jsdoc_1.default)(swaggerOptions);
// Custom Swagger UI implementation for Vercel compatibility
app.get('/api/docs', (req, res) => {
    /**
     * @openapi
     * /api/docs:
     *   get:
     *     summary: Interactive API documentation
     *     description: Swagger UI interface for the API
     *     responses:
     *       200:
     *         description: Swagger UI HTML page
     */
    const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>SD-Parsers API Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
    <style>
      html {
        box-sizing: border-box;
        overflow: -moz-scrollbars-vertical;
        overflow-y: scroll;
      }
      *, *:before, *:after {
        box-sizing: inherit;
      }
      body {
        margin:0;
        background: #fafafa;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function() {
        const ui = SwaggerUIBundle({
          url: '/api/docs/spec.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout"
        });
      };
    </script>
  </body>
</html>`;
    res.send(html);
});
// Serve the swagger spec as JSON
app.get('/api/docs/spec.json', (req, res) => {
    /**
     * @openapi
     * /api/docs/spec.json:
     *   get:
     *     summary: OpenAPI specification
     *     description: Returns the OpenAPI specification in JSON format
     *     responses:
     *       200:
     *         description: OpenAPI specification
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     */
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerSpec);
});
const port = process.env.PORT || 3000;
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept common image formats
        const allowedMimes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    }
});
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve static files from public directory
app.use(express_1.default.static(path_1.default.join(__dirname, '../../public')));
// Create parser manager instance
const parserManager = new index_1.ParserManager({
    debug: process.env.NODE_ENV === 'development',
    eagerness: index_1.Eagerness.DEFAULT
});
// Health check endpoint
/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Returns API health status
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 service:
 *                   type: string
 *                 version:
 *                   type: string
 *                 timestamp:
 *                   type: string
 */
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "sd-parsers-api",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
    });
});
// API documentation endpoint
app.get('/api', (req, res) => {
    /**
     * @openapi
     * /api:
     *   get:
     *     summary: API documentation endpoint
     *     description: Returns API info and supported endpoints
     *     responses:
     *       200:
     *         description: API info
     */
    res.json({
        name: "SD-Parsers API",
        description: "Extract metadata from AI-generated images",
        version: "1.0.0",
        endpoints: {
            "GET /": "Demo webpage",
            "GET /api": "API documentation (this endpoint)",
            "GET /api/health": "Health check",
            "POST /api/parse": "Parse image metadata from uploaded file",
            "POST /api/parse/url": "Parse image metadata from URL",
            "GET /api/parsers": "List supported parsers",
            "GET /api/eagerness": "List eagerness levels",
            "GET /api/docs": "Interactive API documentation (Swagger UI)",
        },
        supportedFormats: ["JPEG", "PNG"],
        supportedGenerators: [
            "Automatic1111",
            "ComfyUI",
            "Fooocus",
            "InvokeAI",
            "NovelAI",
        ],
    });
});
// Root endpoint serves the demo page
app.get('/', (req, res) => {
    /**
     * @openapi
     * /:
     *   get:
     *     summary: Demo web interface
     *     description: Serves the demo HTML page
     *     responses:
     *       200:
     *         description: Demo page
     */
    res.sendFile(path_1.default.join(__dirname, '../../public/index.html'));
});
// Parse image metadata from uploaded file
app.post("/api/parse", upload.single("image"), async (req, res) => {
    /**
     * @openapi
     * /api/parse:
     *   post:
     *     summary: Parse image metadata from uploaded file
     *     requestBody:
     *       required: true
     *       content:
     *         multipart/form-data:
     *           schema:
     *             type: object
     *             properties:
     *               image:
     *                 type: string
     *                 format: binary
     *               eagerness:
     *                 type: string
     *                 enum: [fast, default, eager]
     *     responses:
     *       200:
     *         description: Metadata extracted
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *       400:
     *         description: Bad request
     */
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No image file provided",
                message: 'Please upload an image file using the "image" field',
            });
        }
        const { eagerness } = req.body;
        let eagernessLevel = index_1.Eagerness.DEFAULT;
        if (eagerness) {
            const eagerMap = {
                fast: index_1.Eagerness.FAST,
                default: index_1.Eagerness.DEFAULT,
                eager: index_1.Eagerness.EAGER,
            };
            eagernessLevel = eagerMap[eagerness.toLowerCase()] || index_1.Eagerness.DEFAULT;
        }
        const result = await parserManager.parse(req.file.buffer, eagernessLevel);
        if (result) {
            res.json({
                success: true,
                data: result,
                metadata: {
                    filename: req.file.originalname,
                    size: req.file.size,
                    mimetype: req.file.mimetype,
                    eagerness: eagerness || "default",
                },
            });
        }
        else {
            res.json({
                success: false,
                message: "No metadata found in the image",
                data: null,
                metadata: {
                    filename: req.file.originalname,
                    size: req.file.size,
                    mimetype: req.file.mimetype,
                    eagerness: eagerness || "default",
                },
            });
        }
    }
    catch (error) {
        console.error("Error parsing image:", error);
        res.status(500).json({
            error: "Failed to parse image",
            message: error instanceof Error ? error.message : "Unknown error occurred",
        });
    }
});
// Parse image metadata from URL
app.post("/api/parse/url", async (req, res) => {
    /**
     * @openapi
     * /api/parse/url:
     *   post:
     *     summary: Parse image metadata from URL
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               url:
     *                 type: string
     *               eagerness:
     *                 type: string
     *                 enum: [fast, default, eager]
     *     responses:
     *       200:
     *         description: Metadata extracted
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *       400:
     *         description: Bad request
     */
    try {
        const { url, eagerness } = req.body;
        if (!url) {
            return res.status(400).json({
                error: "No URL provided",
                message: "Please provide an image URL in the request body",
            });
        }
        // Validate URL format
        try {
            new URL(url);
        }
        catch {
            return res.status(400).json({
                error: "Invalid URL",
                message: "Please provide a valid image URL",
            });
        }
        let eagernessLevel = index_1.Eagerness.DEFAULT;
        if (eagerness) {
            const eagerMap = {
                fast: index_1.Eagerness.FAST,
                default: index_1.Eagerness.DEFAULT,
                eager: index_1.Eagerness.EAGER,
            };
            eagernessLevel = eagerMap[eagerness.toLowerCase()] || index_1.Eagerness.DEFAULT;
        }
        // Fetch image from URL
        const response = await fetch(url);
        if (!response.ok) {
            return res.status(400).json({
                error: "Failed to fetch image",
                message: `HTTP ${response.status}: ${response.statusText}`,
            });
        }
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.startsWith("image/")) {
            return res.status(400).json({
                error: "Invalid content type",
                message: "URL does not point to an image file",
            });
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const result = await parserManager.parse(buffer, eagernessLevel);
        if (result) {
            res.json({
                success: true,
                data: result,
                metadata: {
                    url,
                    size: buffer.length,
                    contentType,
                    eagerness: eagerness || "default",
                },
            });
        }
        else {
            res.json({
                success: false,
                message: "No metadata found in the image",
                data: null,
                metadata: {
                    url,
                    size: buffer.length,
                    contentType,
                    eagerness: eagerness || "default",
                },
            });
        }
    }
    catch (error) {
        console.error("Error parsing image from URL:", error);
        res.status(500).json({
            error: "Failed to parse image from URL",
            message: error instanceof Error ? error.message : "Unknown error occurred",
        });
    }
});
// List supported parsers
app.get("/api/parsers", (req, res) => {
    /**
     * @openapi
     * /api/parsers:
     *   get:
     *     summary: List supported parsers
     *     description: Returns a list of supported AI image generators/parsers
     *     responses:
     *       200:
     *         description: List of supported parsers
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 parsers:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       name:
     *                         type: string
     *                       description:
     *                         type: string
     *                       generator:
     *                         type: string
     */
    res.json({
        parsers: [
            {
                name: "Automatic1111",
                description: "Stable Diffusion WebUI by AUTOMATIC1111",
                generator: "AUTOMATIC1111",
            },
            {
                name: "ComfyUI",
                description: "ComfyUI node-based interface",
                generator: "COMFYUI",
            },
            {
                name: "Fooocus",
                description: "Fooocus simplified interface",
                generator: "FOOOCUS",
            },
            {
                name: "InvokeAI",
                description: "InvokeAI web interface",
                generator: "INVOKEAI",
            },
            {
                name: "NovelAI",
                description: "NovelAI image generation",
                generator: "NOVELAI",
            },
        ],
    });
});
// List eagerness levels
app.get("/api/eagerness", (req, res) => {
    /**
     * @openapi
     * /api/eagerness:
     *   get:
     *     summary: List eagerness levels
     *     description: Returns available eagerness levels for parsing
     *     responses:
     *       200:
     *         description: List of eagerness levels
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 levels:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       name:
     *                         type: string
     *                       value:
     *                         type: string
     *                       description:
     *                         type: string
     */
    res.json({
        levels: [
            {
                name: "fast",
                value: index_1.Eagerness.FAST,
                description: "Cut some corners to save time",
            },
            {
                name: "default",
                value: index_1.Eagerness.DEFAULT,
                description: "Try to ensure all metadata is read (recommended)",
            },
            {
                name: "eager",
                value: index_1.Eagerness.EAGER,
                description: "Include additional methods to retrieve metadata (computationally expensive)",
            },
        ],
    });
});
// Error handling middleware
app.use((error, req, res, next) => {
    /**
     * @openapi
     * components:
     *   responses:
     *     ErrorResponse:
     *       description: Error response
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               error:
     *                 type: string
     *               message:
     *                 type: string
     */
    console.error('Unhandled error:', error);
    if (error instanceof multer_1.default.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large',
                message: 'Image file must be smaller than 50MB'
            });
        }
    }
    res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
    });
});
// 404 handler
app.use((req, res) => {
    /**
     * @openapi
     * /{any}:
     *   get:
     *     summary: 404 Not Found
     *     description: Handles undefined endpoints
     *     responses:
     *       404:
     *         $ref: '#/components/responses/ErrorResponse'
     */
    res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} not found`
    });
});
// Start server (only if not in Vercel environment)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`SD-Parsers API server running on port ${port}`);
        console.log(`Visit http://localhost:${port} for API documentation`);
    });
}
// For Vercel compatibility (CommonJS export)
module.exports = app;
//# sourceMappingURL=server.js.map