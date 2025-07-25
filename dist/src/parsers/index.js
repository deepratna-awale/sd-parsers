"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DummyParser = exports.NovelAIParser = exports.InvokeAIParser = exports.ComfyUIParser = exports.FooocusParser = exports.AUTOMATIC1111Parser = exports.Parser = exports.MANAGED_PARSERS = void 0;
const automatic1111_1 = require("./automatic1111");
const fooocus_1 = require("./fooocus");
const comfyui_1 = require("./comfyui");
const invokeai_1 = require("./invokeai");
const novelai_1 = require("./novelai");
/**
 * Default managed parsers in order of precedence
 */
exports.MANAGED_PARSERS = [
    fooocus_1.FooocusParser,
    automatic1111_1.AUTOMATIC1111Parser,
    comfyui_1.ComfyUIParser,
    invokeai_1.InvokeAIParser,
    novelai_1.NovelAIParser,
];
var parser_1 = require("./parser");
Object.defineProperty(exports, "Parser", { enumerable: true, get: function () { return parser_1.Parser; } });
var automatic1111_2 = require("./automatic1111");
Object.defineProperty(exports, "AUTOMATIC1111Parser", { enumerable: true, get: function () { return automatic1111_2.AUTOMATIC1111Parser; } });
var fooocus_2 = require("./fooocus");
Object.defineProperty(exports, "FooocusParser", { enumerable: true, get: function () { return fooocus_2.FooocusParser; } });
var comfyui_2 = require("./comfyui");
Object.defineProperty(exports, "ComfyUIParser", { enumerable: true, get: function () { return comfyui_2.ComfyUIParser; } });
var invokeai_2 = require("./invokeai");
Object.defineProperty(exports, "InvokeAIParser", { enumerable: true, get: function () { return invokeai_2.InvokeAIParser; } });
var novelai_2 = require("./novelai");
Object.defineProperty(exports, "NovelAIParser", { enumerable: true, get: function () { return novelai_2.NovelAIParser; } });
var dummy_1 = require("./dummy");
Object.defineProperty(exports, "DummyParser", { enumerable: true, get: function () { return dummy_1.DummyParser; } });
//# sourceMappingURL=index.js.map