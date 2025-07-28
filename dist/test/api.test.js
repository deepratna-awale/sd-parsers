"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const app_js_1 = __importDefault(require("../src/app.js"));
(0, vitest_1.describe)("GET /api/v1", () => {
    (0, vitest_1.it)("responds with a json message", () => (0, supertest_1.default)(app_js_1.default)
        .get("/api/v1")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(200, {
        message: "API - 👋🌎🌍🌏",
    }));
});
(0, vitest_1.describe)("GET /api/v1/emojis", () => {
    (0, vitest_1.it)("responds with a json message", () => (0, supertest_1.default)(app_js_1.default)
        .get("/api/v1/emojis")
        .set("Accept", "application/json")
        .expect("Content-Type", /json/)
        .expect(200, ["😀", "😳", "🙄"]));
});
//# sourceMappingURL=api.test.js.map