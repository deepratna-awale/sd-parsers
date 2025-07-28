"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const app_js_1 = __importDefault(require("../src/app.js"));
(0, vitest_1.describe)("app", () => {
    (0, vitest_1.it)("responds with a not found message", () => (0, supertest_1.default)(app_js_1.default)
        .get("/what-is-this-even")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(404));
});
(0, vitest_1.describe)("GET /", () => {
    (0, vitest_1.it)("responds with a json message", () => (0, supertest_1.default)(app_js_1.default)
        .get("/")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(200, {
        message: "🦄🌈✨👋🌎🌍🌏✨🌈🦄",
    }));
});
//# sourceMappingURL=app.test.js.map