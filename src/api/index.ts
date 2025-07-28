/* eslint-disable perfectionist/sort-imports */
import express from "express";
import eagerness from "./eagerness.js";
import health from "./health.js";
import parse from "./parse.js";
import parsers from "./parsers.js";

const router = express.Router();

router.use("/health", health);
router.use("/parse", parse);
router.use("/parsers", parsers);
router.use("/eagerness", eagerness);

export default router;
