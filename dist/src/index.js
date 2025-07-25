"use strict";
/**
 * A library to read metadata from images created with Stable Diffusion.
 *
 * Basic usage:
 * ```typescript
 * import { ParserManager } from 'sd-parsers';
 *
 * const parserManager = new ParserManager();
 *
 * async function main() {
 *   const promptInfo = await parserManager.parse('image.png');
 *   if (promptInfo) {
 *     console.log(promptInfo);
 *   }
 * }
 * ```
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Eagerness = exports.ParserManager = void 0;
var parserManager_1 = require("./parserManager");
Object.defineProperty(exports, "ParserManager", { enumerable: true, get: function () { return parserManager_1.ParserManager; } });
var extractors_1 = require("./extractors");
Object.defineProperty(exports, "Eagerness", { enumerable: true, get: function () { return extractors_1.Eagerness; } });
__exportStar(require("./data"), exports);
__exportStar(require("./parsers"), exports);
__exportStar(require("./exceptions"), exports);
//# sourceMappingURL=index.js.map