"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sd_parsers_1 = require("sd-parsers");
const router = express_1.default.Router();
/**
 * List eagerness levels
 * @swagger
 * /api/eagerness:
 *   get:
 *     summary: List eagerness levels
 *     description: Returns available eagerness levels with descriptions for parsing operations
 *     tags:
 *       - Information
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
 *                         example: fast
 *                       value:
 *                         type: string
 *                         example: "0"
 *                       description:
 *                         type: string
 *                         example: Cut some corners to save time
 */
router.get("/", (req, res) => {
    res.json({
        levels: [
            {
                name: "fast",
                value: sd_parsers_1.Eagerness.FAST,
                description: "Cut some corners to save time",
            },
            {
                name: "default",
                value: sd_parsers_1.Eagerness.DEFAULT,
                description: "Try to ensure all metadata is read (recommended)",
            },
            {
                name: "eager",
                value: sd_parsers_1.Eagerness.EAGER,
                description: "Include additional methods to retrieve metadata (computationally expensive)",
            },
        ],
    });
});
exports.default = router;
//# sourceMappingURL=eagerness.js.map