import { ImageParser } from "@/components/image-parser";
import { LIMITS } from "@/lib/rate-limit";

const GENERATORS = ["AUTOMATIC1111", "ComfyUI", "Fooocus", "InvokeAI", "NovelAI"];

const REPO = "https://github.com/deepratna-awale/sd-parsers";
const NPM = "https://www.npmjs.com/package/sd-parsers";

export default function Home() {
  return (
    <>
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="#" className="flex items-center gap-2 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static svg */}
            <img src="/icon.svg" alt="" className="h-6 w-6" />
            sd-parsers
          </a>
          <div className="flex items-center gap-5 text-sm text-muted">
            <a href="#api" className="hover:text-foreground">
              API
            </a>
            <a href={NPM} className="hover:text-foreground" target="_blank" rel="noreferrer">
              npm
            </a>
            <a href={REPO} className="hover:text-foreground" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-16 px-4 py-12 sm:px-6">
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Read the prompt behind an AI image</h1>
            <p className="max-w-2xl text-muted">
              Drop a Stable Diffusion image to see its prompt, negative prompt, sampler settings and models. Your
              images are parsed right here in your browser and are never uploaded.
            </p>
            <ul className="flex flex-wrap gap-2 pt-1">
              {GENERATORS.map((name) => (
                <li key={name} className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <ImageParser />
        </section>

        <section id="api" className="flex flex-col gap-4 scroll-mt-8">
          <h2 className="text-2xl font-semibold tracking-tight">API</h2>
          <p className="text-muted">
            For scripts, there is a small HTTP API. It is shared by everyone, so it is rate limited; for bulk work
            use the npm package instead, which does the same thing locally.
          </p>
          <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-sm">
            {`curl -X POST --data-binary @image.png \\
  https://sd-parsers.vercel.app/api/parse`}
          </pre>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Send the image as the raw request body, or as a <code className="font-mono">file</code> field of a multipart form.</li>
            <li>PNG, JPEG or WEBP, at most 4 MB.</li>
            <li>
              {LIMITS.perMinute} requests per minute and {LIMITS.perDay} per day for each client, with a shared daily
              cap. Responses carry <code className="font-mono">RateLimit-*</code> headers, and{" "}
              <code className="font-mono">429</code> responses a <code className="font-mono">Retry-After</code>.
            </li>
            <li>Stealth metadata in the alpha channel is only read on this page, not by the API.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">Use it in your code</h2>
          <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-sm">
            {`npm install sd-parsers

import { ParserManager } from "sd-parsers";

const info = await new ParserManager().parse("image.png");
console.log(info?.generator, info?.samplers);`}
          </pre>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-4 py-6 text-sm text-muted sm:px-6">
          MIT licensed. A TypeScript port of{" "}
          <a href="https://github.com/d3x-at/sd-parsers" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
            sd-parsers
          </a>{" "}
          by d3x-at.
        </div>
      </footer>
    </>
  );
}
