"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_js_1 = __importDefault(require("./app.js"));
const env_js_1 = require("./env.js");
const port = env_js_1.env.PORT;
const server = app_js_1.default.listen(port, () => {
    /* eslint-disable no-console */
    console.log(`Listening: http://localhost:${port}`);
    /* eslint-enable no-console */
});
server.on("error", (err) => {
    if ("code" in err && err.code === "EADDRINUSE") {
        console.error(`Port ${env_js_1.env.PORT} is already in use. Please choose another port or stop the process using it.`);
    }
    else {
        console.error("Failed to start server:", err);
    }
    process.exit(1);
});
//# sourceMappingURL=index.js.map