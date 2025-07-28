"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
/**
 * Health check endpoint
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Returns API health status
 *     tags:
 *       - Health
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
 *                   example: ok
 *                 service:
 *                   type: string
 *                   example: sd-parsers-api
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-07-28T10:30:00.000Z
 */
router.get("/", (req, res) => {
    res.json({
        status: "ok",
        service: "sd-parsers-api",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
    });
});
exports.default = router;
//# sourceMappingURL=health.js.map