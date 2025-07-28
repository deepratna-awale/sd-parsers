import express from "express";
import { Eagerness } from "sd-parsers";

const router = express.Router();

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
        value: Eagerness.FAST,
        description: "Cut some corners to save time",
      },
      {
        name: "default",
        value: Eagerness.DEFAULT,
        description: "Try to ensure all metadata is read (recommended)",
      },
      {
        name: "eager",
        value: Eagerness.EAGER,
        description:
          "Include additional methods to retrieve metadata (computationally expensive)",
      },
    ],
  });
});

export default router;
