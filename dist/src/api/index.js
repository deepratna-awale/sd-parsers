"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable perfectionist/sort-imports */
const express_1 = __importDefault(require("express"));
const eagerness_js_1 = __importDefault(require("./eagerness.js"));
const health_js_1 = __importDefault(require("./health.js"));
const parse_js_1 = __importDefault(require("./parse.js"));
const parsers_js_1 = __importDefault(require("./parsers.js"));
const router = express_1.default.Router();
router.use("/health", health_js_1.default);
router.use("/parse", parse_js_1.default);
router.use("/parsers", parsers_js_1.default);
router.use("/eagerness", eagerness_js_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map