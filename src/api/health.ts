import express from "express";

const router = express.Router();

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

export default router;
