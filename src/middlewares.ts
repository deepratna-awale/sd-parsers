import type { NextFunction, Request, Response } from "express";

import multer from "multer";

import type ErrorResponse from "./interfaces/error-response.js";

import { env } from "./env.js";

export function notFound(req: Request, res: Response, next: NextFunction) {
  res.status(404);
  const error = new Error(`🔍 - Not Found - ${req.originalUrl}`);
  next(error);
}

export function errorHandler(err: Error, req: Request, res: Response<ErrorResponse>, _next: NextFunction) {
  console.error("Unhandled error:", err);

  // Handle multer-specific errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        message: "Image file must be smaller than 50MB",
        stack: env.NODE_ENV === "production" ? "🥞" : err.stack,
      });
      return;
    }
  }

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: env.NODE_ENV === "production" ? "🥞" : err.stack,
  });
}
