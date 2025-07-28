"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = notFound;
exports.errorHandler = errorHandler;
const multer_1 = __importDefault(require("multer"));
const env_js_1 = require("./env.js");
function notFound(req, res, next) {
    res.status(404);
    const error = new Error(`🔍 - Not Found - ${req.originalUrl}`);
    next(error);
}
function errorHandler(err, req, res, _next) {
    console.error("Unhandled error:", err);
    // Handle multer-specific errors
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            res.status(400).json({
                message: "Image file must be smaller than 50MB",
                stack: env_js_1.env.NODE_ENV === "production" ? "🥞" : err.stack,
            });
            return;
        }
    }
    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
    res.status(statusCode);
    res.json({
        message: err.message,
        stack: env_js_1.env.NODE_ENV === "production" ? "🥞" : err.stack,
    });
}
//# sourceMappingURL=middlewares.js.map