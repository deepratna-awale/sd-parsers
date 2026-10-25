import type { ReactNode } from "react";
import { ImageParser } from "@/components/image-parser";
import { CopyButton } from "@/components/copy-button";
import { LIMITS } from "@/lib/rate-limit";

const GENERATORS = ["AUTOMATIC1111", "ComfyUI", "Fooocus", "InvokeAI", "NovelAI"];

const REPO = "https://github.com/deepratna-awale/sd-parsers";
const NPM = "https://www.npmjs.com/package/sd-parsers";

const CURL = `curl -X POST --data-binary @image.png \\
  https://sd-parsers.vercel.app/api/parse`;

const INSTALL = "npm install sd-parsers";

const USAGE = `import { ParserManager } from "sd-parsers";

const info = await new ParserManager().parse("image.png");
console.log(info?.generator, info?.samplers);`;

const FEATURES: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: "Private by design",
    text: "Images are read in your browser. Nothing is uploaded, logged or stored.",
    icon: <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Zm-3 9 2 2 4-4" />,
  },
  {
    title: "Every popular UI",
    text: "AUTOMATIC1111 and its forks, ComfyUI workflows, Fooocus, InvokeAI and NovelAI.",
    icon: <path d="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    title: "Finds hidden data",
    text: "Reads PNG text chunks, JPEG and WEBP EXIF, and stealth metadata hidden in the alpha channel.",
    icon: <path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12Zm9 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  },
];

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-code text-code-foreground shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </span>
          <span className="font-mono text-xs text-white/50">{title}</span>
        </div>
        <CopyButton text={code} tone="dark" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">{code}</pre>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="#" className="flex items-center gap-2.5 font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static svg */}
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            sd-parsers
          </a>
          <div className="flex items-center gap-2 text-sm text-muted">
            <a href="#api" className="rounded-lg px-3 py-1.5 transition-colors hover:bg-card-strong hover:text-foreground">
              API
            </a>
            <a
              href={NPM}
              className="ml-1 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 font-medium text-foreground transition-colors hover:border-accent"
              target="_blank"
              rel="noreferrer"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-[#cb3837]" fill="currentColor">
                <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
              </svg>
              npm
            </a>
            <a
              href={REPO}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 font-medium text-foreground transition-colors hover:border-accent"
              target="_blank"
              rel="noreferrer"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
              GitHub
            </a>
          </div>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="relative isolate overflow-hidden">
          <div className="hero-backdrop absolute inset-0 -z-10" aria-hidden />
          <div className="hero-grid absolute inset-0 -z-10" aria-hidden />
          <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Runs in your browser. Nothing is uploaded.
              </span>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
                Read the <span className="text-gradient">prompt</span> behind any AI image
              </h1>
              <p className="max-w-2xl text-base text-muted text-pretty sm:text-lg">
                Drop a Stable Diffusion image to see its prompt, negative prompt, sampler settings and models.
              </p>
              <ul className="flex flex-wrap justify-center gap-2">
                {GENERATORS.map((name) => (
                  <li
                    key={name}
                    className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
            <ImageParser />
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-12 sm:grid-cols-3 sm:px-6">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon>{feature.icon}</Icon>
              </div>
              <h2 className="font-semibold">{feature.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{feature.text}</p>
            </div>
          ))}
        </section>

        <section id="api" className="mx-auto grid w-full max-w-5xl scroll-mt-20 gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-sm font-semibold text-accent">For developers</p>
            <h2 className="text-3xl font-semibold tracking-tight">Use it in your code</h2>
            <p className="text-muted">
              The same parser ships on npm. It runs in Node.js, browsers, Deno, Bun and edge functions, with full
              TypeScript types.
            </p>
            <CodeBlock title="terminal" code={INSTALL} />
            <CodeBlock title="index.ts" code={USAGE} />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-sm font-semibold text-accent">HTTP API</p>
            <h2 className="text-3xl font-semibold tracking-tight">Or call the API</h2>
            <p className="text-muted">
              For quick scripts there is a small, shared API. It is rate limited, so for bulk work use the npm package,
              which does the same thing locally.
            </p>
            <CodeBlock title="terminal" code={CURL} />
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              {[
                <>
                  Send the image as the raw request body, or as a <code className="font-mono text-foreground">file</code>{" "}
                  field of a multipart form.
                </>,
                <>PNG, JPEG or WEBP, at most 4 MB.</>,
                <>
                  {LIMITS.perMinute} requests per minute and {LIMITS.perDay} per day for each client, with a shared daily
                  cap. Responses carry <code className="font-mono text-foreground">RateLimit-*</code> headers.
                </>,
                <>Stealth metadata in the alpha channel is only read on this page, not by the API.</>,
              ].map((item, index) => (
                <li key={index} className="flex gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent">
                    <path d="m5 12 4.5 4.5L19 7" />
                  </Icon>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="mt-8 border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <p>
            MIT licensed. A TypeScript port of{" "}
            <a
              href="https://github.com/d3x-at/sd-parsers"
              className="underline decoration-border underline-offset-4 hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              sd-parsers
            </a>{" "}
            by d3x-at.
          </p>
          <div className="flex gap-4">
            <a href={REPO} className="hover:text-foreground" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={NPM} className="hover:text-foreground" target="_blank" rel="noreferrer">
              npm
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
