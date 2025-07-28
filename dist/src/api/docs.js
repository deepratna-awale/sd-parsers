"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
/**
 * API documentation endpoint
 * @swagger
 * /api:
 *   get:
 *     summary: API documentation endpoint
 *     description: Returns API info and supported endpoints
 *     tags:
 *       - Documentation
 *     responses:
 *       200:
 *         description: API info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   example: SD-Parsers API
 *                 description:
 *                   type: string
 *                   example: Extract metadata from AI-generated images
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 endpoints:
 *                   type: object
 *                 supportedFormats:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["JPEG", "PNG"]
 *                 supportedGenerators:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Automatic1111", "ComfyUI", "Fooocus"]
 */
router.get("/", (req, res) => {
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
exports.default = router;
//# sourceMappingURL=docs.js.map