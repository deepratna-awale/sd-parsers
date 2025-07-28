"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const v4_1 = require("zod/v4");
const envSchema = v4_1.z.object({
    NODE_ENV: v4_1.z.enum(["development", "production", "test"]).default("development"),
    PORT: v4_1.z.coerce.number().default(3000),
});
try {
    // eslint-disable-next-line node/no-process-env
    envSchema.parse(process.env);
}
catch (error) {
    if (error instanceof v4_1.z.ZodError) {
        console.error("Missing environment variables:", error.issues.flatMap(issue => issue.path));
    }
    else {
        console.error(error);
    }
    process.exit(1);
}
// eslint-disable-next-line node/no-process-env
exports.env = envSchema.parse(process.env);
//# sourceMappingURL=env.js.map