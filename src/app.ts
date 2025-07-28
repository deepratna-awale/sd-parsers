import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import api from "./api/index.js";
import { env } from "./env.js";
import { errorHandler, notFound } from "./middlewares.js";

const app = express();

/**
 * Generate OpenAPI specification
 * In development: Generate from JSDoc comments
 * In production: Use pre-generated static file or fallback to JSDoc
 */
function generateSwaggerSpec() {
  // Base OpenAPI definition
  const baseDefinition = {
    openapi: "3.0.0",
    info: {
      title: "SD-Parsers API",
      version: "1.0.0",
      description: "Extract metadata from AI-generated images (Stable Diffusion)",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local server" },
      { url: "https://sd-parsers.vercel.app", description: "Production" },
    ],
    components: {
      responses: {
        ErrorResponse: {
          description: "Error response",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };

  // Try to read pre-generated OpenAPI spec first (for production)
  const staticSpecPath = path.join(__dirname, "../openapi.yaml");
  if (existsSync(staticSpecPath)) {
    try {
      const _yamlContent = readFileSync(staticSpecPath, "utf8");
      // For now, return the base definition with manually defined paths
      // TODO: Implement YAML parsing if needed
    }
    catch {
      console.warn("Failed to read static OpenAPI spec, falling back to JSDoc generation");
    }
  }

  // Generate from JSDoc comments (works in both dev and production)
  const swaggerOptions = {
    definition: baseDefinition,
    apis: [
      "./src/**/*.ts", // Development
      "./dist/src/**/*.js", // Production
      path.join(__dirname, "**/*.js"), // Runtime path
    ],
  };

  try {
    return swaggerJSDoc(swaggerOptions);
  }
  catch {
    console.warn("JSDoc generation failed, using base definition with manual paths");

    // Fallback: manually define the main endpoints
    return {
      ...baseDefinition,
      paths: {
        "/api/health": {
          get: {
            summary: "Health check",
            description: "Returns API health status",
            tags: ["Health"],
            responses: {
              200: {
                description: "API is healthy",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        status: { type: "string", example: "ok" },
                        service: { type: "string", example: "sd-parsers-api" },
                        version: { type: "string", example: "1.0.0" },
                        timestamp: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/api/parse": {
          post: {
            summary: "Parse image metadata from uploaded file",
            description: "Extract metadata from AI-generated images uploaded as multipart form data",
            tags: ["Parser"],
            requestBody: {
              required: true,
              content: {
                "multipart/form-data": {
                  schema: {
                    type: "object",
                    properties: {
                      image: {
                        type: "string",
                        format: "binary",
                        description: "Image file to parse (JPEG/PNG, max 50MB)",
                      },
                      eagerness: {
                        type: "string",
                        enum: ["fast", "default", "eager"],
                        description: "Parsing eagerness level",
                        default: "default",
                      },
                    },
                    required: ["image"],
                  },
                },
              },
            },
            responses: {
              200: {
                description: "Metadata extracted successfully",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        success: { type: "boolean", example: true },
                        data: {
                          type: "object",
                          description: "Extracted metadata from the image",
                        },
                        metadata: {
                          type: "object",
                          properties: {
                            filename: { type: "string" },
                            size: { type: "number" },
                            mimetype: { type: "string" },
                            eagerness: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
              400: {
                $ref: "#/components/responses/ErrorResponse",
              },
            },
          },
        },
        "/api/parse/url": {
          post: {
            summary: "Parse image metadata from URL",
            description: "Extract metadata from AI-generated images by providing a URL",
            tags: ["Parser"],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      url: {
                        type: "string",
                        format: "uri",
                        description: "URL of the image to parse",
                      },
                      eagerness: {
                        type: "string",
                        enum: ["fast", "default", "eager"],
                        description: "Parsing eagerness level",
                        default: "default",
                      },
                    },
                    required: ["url"],
                  },
                },
              },
            },
            responses: {
              200: {
                description: "Metadata extracted successfully",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        success: { type: "boolean", example: true },
                        data: {
                          type: "object",
                          description: "Extracted metadata from the image",
                        },
                        metadata: {
                          type: "object",
                          properties: {
                            url: { type: "string" },
                            eagerness: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
              400: {
                $ref: "#/components/responses/ErrorResponse",
              },
            },
          },
        },
        "/api/parsers": {
          get: {
            summary: "Get available parsers",
            description: "Returns list of available metadata parsers",
            tags: ["Parser"],
            responses: {
              200: {
                description: "List of available parsers",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        parsers: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/api/eagerness": {
          get: {
            summary: "Get eagerness levels",
            description: "Returns available eagerness levels for parsing",
            tags: ["Parser"],
            responses: {
              200: {
                description: "List of eagerness levels",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        levels: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }
}

const swaggerSpec = generateSwaggerSpec();

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"], // Keep unsafe-inline for the embedded CSS
      scriptSrc: ["'self'"], // No more inline scripts needed
      // scriptSrcAttr removed - no more inline event handlers
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(cors());
app.use(express.json());

/**
 * Serve static files from public directory
 * Serves demo HTML page and favicon
 */
const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));

/**
 * Serve compiled client scripts from dist directory
 */
const clientDistDir = path.join(__dirname, "../dist/src/client");
app.use("/js", express.static(clientDistDir));

/**
 * Root endpoint serves the demo page
 * @swagger
 * /:
 *   get:
 *     summary: Demo web interface
 *     description: Serves the demo HTML page
 *     tags:
 *       - Demo
 *     responses:
 *       200:
 *         description: Demo page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// API routes
app.use("/api", api);

// Use middleware for 404 and error handling
app.use(notFound);
app.use(errorHandler);

export default app;
