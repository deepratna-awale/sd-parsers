// The library relies on Node's global `Buffer`; provide it in the browser.
// Import this module before anything from the library.
import { Buffer } from "buffer";

const scope = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
scope.Buffer ??= Buffer;
