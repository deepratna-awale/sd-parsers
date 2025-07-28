import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import swaggerUi from "swagger-ui-express";

import api from "./api/index.js";
import { env } from "./env.js";
import { errorHandler, notFound } from "./middlewares.js";

const app = express();

/**
 * Swagger API specification for SD-Parsers API
 * Basic OpenAPI spec without paths - using JSDoc comments for endpoint documentation
 */
const swaggerSpec = {
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
