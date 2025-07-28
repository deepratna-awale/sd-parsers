"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const node_buffer_1 = require("node:buffer");
const sd_parsers_1 = require("sd-parsers");
const env_js_1 = require("../env.js");
const router = express_1.default.Router();
/**
 * Configure multer for file uploads
 * Supports in-memory storage with 50MB limit
 * Only accepts JPEG and PNG image formats
 */
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept common image formats
        const allowedMimes = ["image/jpeg", "image/jpg", "image/png"];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error("Only image files are allowed"));
        }
    },
});
/**
 * Create parser manager instance for processing AI-generated images
 * Configured with debug mode based on environment and default eagerness
 */
const parserManager = new sd_parsers_1.ParserManager({
    debug: env_js_1.env.NODE_ENV === "development",
    eagerness: sd_parsers_1.Eagerness.DEFAULT,
});
/**
 * Parse image metadata from uploaded file
 * @swagger
 * /api/parse:
 *   post:
 *     summary: Parse image metadata from uploaded file
 *     description: Extract metadata from AI-generated images uploaded as multipart form data
 *     tags:
 *       - Parser
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
 *                 description: Image file to parse (JPEG/PNG, max 50MB)
 *               eagerness:
 *                 type: string
 *                 enum: [fast, default, eager]
 *                 description: Parsing eagerness level
 *                 default: default
 *             required:
 *               - image
 *     responses:
 *       200:
 *         description: Metadata extracted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Extracted metadata from the image
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     filename:
 *                       type: string
 *                     size:
 *                       type: number
 *                     mimetype:
 *                       type: string
 *                     eagerness:
 *                       type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 */
router.post("/", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({
                error: "No image file provided",
                message: "Please upload an image file using the \"image\" field",
            });
            return;
        }
        const { eagerness } = req.body;
        let eagernessLevel = sd_parsers_1.Eagerness.DEFAULT;
        if (eagerness) {
            const eagerMap = {
                fast: sd_parsers_1.Eagerness.FAST,
                default: sd_parsers_1.Eagerness.DEFAULT,
                eager: sd_parsers_1.Eagerness.EAGER,
            };
            const eagerKey = typeof eagerness === "string" ? eagerness.toLowerCase() : "default";
            eagernessLevel = eagerMap[eagerKey] || sd_parsers_1.Eagerness.DEFAULT;
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
/**
 * Parse image metadata from URL
 * @swagger
 * /api/parse/url:
 *   post:
 *     summary: Parse image metadata from URL
 *     description: Extract metadata from AI-generated images by providing an image URL
 *     tags:
 *       - Parser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: URL of the image to parse
 *                 example: https://example.com/image.jpg
 *               eagerness:
 *                 type: string
 *                 enum: [fast, default, eager]
 *                 description: Parsing eagerness level
 *                 default: default
 *             required:
 *               - url
 *     responses:
 *       200:
 *         description: Metadata extracted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Extracted metadata from the image
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     size:
 *                       type: number
 *                     contentType:
 *                       type: string
 *                     eagerness:
 *                       type: string
 *       400:
 *         description: Bad request - Invalid URL or image format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 */
router.post("/url", async (req, res) => {
    try {
        const { url, eagerness } = req.body;
        if (!url) {
            res.status(400).json({
                error: "No URL provided",
                message: "Please provide an image URL in the request body",
            });
            return;
        }
        // Validate URL format
        try {
            const _validUrl = new URL(url);
        }
        catch {
            res.status(400).json({
                error: "Invalid URL",
                message: "Please provide a valid image URL",
            });
            return;
        }
        let eagernessLevel = sd_parsers_1.Eagerness.DEFAULT;
        if (eagerness) {
            const eagerMap = {
                fast: sd_parsers_1.Eagerness.FAST,
                default: sd_parsers_1.Eagerness.DEFAULT,
                eager: sd_parsers_1.Eagerness.EAGER,
            };
            const eagerKey = typeof eagerness === "string" ? eagerness.toLowerCase() : "default";
            eagernessLevel = eagerMap[eagerKey] || sd_parsers_1.Eagerness.DEFAULT;
        }
        // Fetch image from URL
        const response = await fetch(url);
        if (!response.ok) {
            res.status(400).json({
                error: "Failed to fetch image",
                message: `HTTP ${response.status}: ${response.statusText}`,
            });
            return;
        }
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.startsWith("image/")) {
            res.status(400).json({
                error: "Invalid content type",
                message: "URL does not point to an image file",
            });
            return;
        }
        const buffer = node_buffer_1.Buffer.from(await response.arrayBuffer());
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
exports.default = router;
//# sourceMappingURL=parse.js.map