import { clientKey, isBlocked } from "@/lib/client-ip";
import { checkRateLimit, LIMITS, type LimitResult } from "@/lib/rate-limit";
import { parseImageBytes } from "@/lib/sd/parse";
import { promptInfoToDict } from "sd-parsers/data";

export const maxDuration = 10;

/** Vercel rejects request bodies above 4.5 MB; stay below that */
const MAX_BYTES = 4 * 1024 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

function error(status: number, message: string, headers: HeadersInit = {}) {
  return Response.json({ error: message }, { status, headers: { ...NO_STORE, ...headers } });
}

function limitHeaders(result: LimitResult): Record<string, string> {
  const seconds = Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(seconds),
    ...(result.success ? {} : { "Retry-After": String(seconds) }),
  };
}

/** Read the request body, giving up as soon as it grows past the limit */
async function readBody(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function imageFromBody(request: Request, body: Uint8Array): Promise<Uint8Array | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) return body;

  const form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
  const file = form.get("file") ?? form.get("image");
  return file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : null;
}

export async function POST(request: Request) {
  if (process.env.PARSE_API_DISABLED === "true") {
    return error(503, "The parse API is turned off. Use the website, which parses images in your browser.");
  }

  const key = clientKey(request);
  if (isBlocked(key)) return error(403, "Forbidden");

  let limit: LimitResult | null;
  try {
    limit = await checkRateLimit(key);
  } catch {
    limit = null;
  }
  if (!limit) return error(503, "The parse API is temporarily unavailable.");
  const headers = limitHeaders(limit);
  if (!limit.success) {
    const message =
      limit.scope === "global"
        ? "The API has reached its daily capacity. Use the website, which parses images in your browser."
        : "Too many requests. Slow down and try again later.";
    return error(429, message, headers);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (!request.headers.has("content-length") || !Number.isFinite(declaredLength)) {
    return error(411, "A Content-Length header is required.", headers);
  }
  if (declaredLength > MAX_BYTES) return error(413, `Images must be at most ${MAX_BYTES / 1024 / 1024} MB.`, headers);

  const body = await readBody(request);
  if (!body) return error(413, `Images must be at most ${MAX_BYTES / 1024 / 1024} MB.`, headers);

  let image: Uint8Array | null;
  try {
    image = await imageFromBody(request, body);
  } catch {
    return error(400, "Could not read the multipart form data.", headers);
  }
  if (!image?.length) return error(400, "Send the image as the request body or as a `file` form field.", headers);

  try {
    const { format, promptInfo } = await parseImageBytes(image);
    if (!format) return error(415, "Only PNG, JPEG and WEBP images are supported.", headers);
    return Response.json(
      { format, found: promptInfo !== null, ...(promptInfo ? promptInfoToDict(promptInfo) : {}) },
      { headers: { ...NO_STORE, ...headers } },
    );
  } catch {
    return error(422, "The image could not be parsed.", headers);
  }
}

export async function GET() {
  return Response.json(
    {
      usage: "POST an image (PNG, JPEG or WEBP) as the raw request body or as a `file` multipart form field.",
      maxBytes: MAX_BYTES,
      limits: LIMITS,
      note: "Stealth (alpha channel) metadata is only read on the website, which parses images in your browser.",
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
