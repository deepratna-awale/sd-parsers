"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const node_path_1 = __importDefault(require("node:path"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const index_js_1 = __importDefault(require("./api/index.js"));
const env_js_1 = require("./env.js");
const middlewares_js_1 = require("./middlewares.js");
const app = (0, express_1.default)();
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
app.use("/api/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec));
// Middleware
app.use((0, helmet_1.default)({
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
app.use((0, morgan_1.default)(env_js_1.env.NODE_ENV === "development" ? "dev" : "combined"));
app.use((0, cors_1.default)());
app.use(express_1.default.json());
/**
 * Serve static files from public directory
 * Serves demo HTML page and favicon
 */
const publicDir = node_path_1.default.join(__dirname, "../public");
app.use(express_1.default.static(publicDir));
/**
 * Serve compiled client scripts from dist directory
 */
const clientDistDir = node_path_1.default.join(__dirname, "../dist/src/client");
app.use("/js", express_1.default.static(clientDistDir));
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
    res.sendFile(node_path_1.default.join(publicDir, "index.html"));
});
// API routes
app.use("/api", index_js_1.default);
// Use middleware for 404 and error handling
app.use(middlewares_js_1.notFound);
app.use(middlewares_js_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map