#!/usr/bin/env tsx

/**
 * Script to generate a static OpenAPI specification file
 * This is useful for production deployments where the JSDoc comments
 * might not be available or accessible at runtime.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import swaggerJSDoc from "swagger-jsdoc";

const swaggerOptions = {
  definition: {
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
  },
  apis: ["./src/**/*.ts"], // Path to the API files with JSDoc comments
};

try {
  const swaggerSpec = swaggerJSDoc(swaggerOptions);
  const outputPath = path.join(process.cwd(), "dist", "openapi.json");

  writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));
  console.log(`✅ OpenAPI specification generated at: ${outputPath}`);

  // Also create a YAML version if needed
  const yamlOutput = path.join(process.cwd(), "dist", "openapi.yaml");
  const yaml = `# OpenAPI specification for SD-Parsers API
# This file can be used by Swagger UI in production
# Generated from JSDoc comments in the TypeScript source code

${JSON.stringify(swaggerSpec, null, 2)}`;

  writeFileSync(yamlOutput, yaml);
  console.log(`✅ OpenAPI specification (YAML format) generated at: ${yamlOutput}`);
}
catch (error) {
  console.error("❌ Failed to generate OpenAPI specification:", error);
  process.exit(1);
}
