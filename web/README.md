# sd-parsers web

The website and HTTP API for [sd-parsers](../README.md), built with Next.js.

The site imports the library straight from `../src`, so it always matches the code in this repository.

## How it stays cheap to run

- **Parsing happens in the browser.** Pages are prerendered static files, and dropped images are read client side (including stealth metadata in the alpha channel). Using the site never runs server code.
- **`/api/parse` is small and guarded.** Requests are counted per client (IPv6 clients per /64) in Upstash Redis: 5 per minute, 100 per day, plus a global cap of 2000 a day sized to stay inside the free Upstash and Vercel Hobby quotas. Bodies over 4 MB and requests without `Content-Length` are refused before they are read, only PNG/JPEG/WEBP are accepted, and the API never decodes pixels. Without Redis in production the API stays closed (503) instead of running without limits.
- **Security headers**: strict CSP, no framing, `nosniff`.

## Development

```bash
npm ci
npm run dev
```

Without Redis, development uses in-memory counters. See [`.env.example`](.env.example) for all settings.

## Deploying on Vercel

1. Import the repository and set **Root Directory** to `web`.
2. Add Upstash Redis from the Vercel Marketplace (Storage → Upstash → Redis) and connect it to the project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Optionally add a Firewall rate limit rule for `/api/parse` so floods are dropped before they reach the function.
