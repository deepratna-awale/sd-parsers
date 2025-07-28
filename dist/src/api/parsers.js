"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
/**
 * List supported parsers
 * @swagger
 * /api/parsers:
 *   get:
 *     summary: List supported parsers
 *     description: Returns a list of supported AI image generators and their descriptions
 *     tags:
 *       - Information
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
 *                         example: Automatic1111
 *                       description:
 *                         type: string
 *                         example: Stable Diffusion WebUI by AUTOMATIC1111
 *                       generator:
 *                         type: string
 *                         example: AUTOMATIC1111
 */
router.get("/", (req, res) => {
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
exports.default = router;
//# sourceMappingURL=parsers.js.map