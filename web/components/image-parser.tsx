"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getFullNegativePrompt,
  getFullPrompt,
  getModels,
  modelToString,
  promptInfoToDict,
  type PromptInfo,
} from "sd-parsers/data";
import type { ParseResult } from "@/lib/sd/parse";
import { CopyButton } from "./copy-button";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

const EXAMPLES = [
  { name: "AUTOMATIC1111", file: "automatic1111.png", prompt: "photo of a duck" },
  { name: "ComfyUI", file: "comfyui.png", prompt: "victorian woman with wings" },
  { name: "Fooocus", file: "fooocus.png", prompt: "a smiling goldfish" },
  { name: "NovelAI", file: "novelai.png", prompt: "cat, space, icon" },
];

const GENERATOR_STYLES: Record<string, string> = {
  AUTOMATIC1111: "bg-orange-500/10 text-orange-600 ring-orange-500/25 dark:text-orange-300",
  ComfyUI: "bg-sky-500/10 text-sky-600 ring-sky-500/25 dark:text-sky-300",
  Fooocus: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-300",
  InvokeAI: "bg-teal-500/10 text-teal-600 ring-teal-500/25 dark:text-teal-300",
  NovelAI: "bg-pink-500/10 text-pink-600 ring-pink-500/25 dark:text-pink-300",
};
const MAX_FILES = 20;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

interface Entry {
  id: number;
  name: string;
  size: number;
  url: string;
  status: "parsing" | "done" | "error";
  /** Processing steps shown while parsing, and how many have finished */
  steps?: string[];
  step?: number;
  result?: ParseResult;
  error?: string;
}

let nextId = 0;

const STEP_MS = 380;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function processingSteps(file: File, deepScan: boolean) {
  const png = file.type === "image/png";
  return [
    "Reading file",
    png ? "Scanning PNG text chunks" : "Reading EXIF metadata",
    ...(png && deepScan ? ["Checking the alpha channel for hidden data"] : []),
    "Matching the generator's format",
  ];
}

export function ImageParser() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [deepScan, setDeepScan] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());

  const update = (id: number, patch: Partial<Entry>) =>
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  const addFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => ACCEPTED.includes(file.type)).slice(0, MAX_FILES);
      if (!images.length) return;

      const added = images.map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        return { file, entry: { id: nextId++, name: file.name, size: file.size, url, status: "parsing" } as Entry };
      });
      setEntries((current) => [...added.map(({ entry }) => entry), ...current].slice(0, MAX_FILES));

      // the parser is only loaded once someone drops an image
      const { parseFile } = await import("@/lib/sd/browser");
      for (const { file, entry } of added) {
        if (file.size > MAX_FILE_BYTES) {
          update(entry.id, { status: "error", error: "File is larger than 64 MB." });
          continue;
        }
        try {
          const steps = processingSteps(file, deepScan);
          update(entry.id, { steps, step: 0 });
          const parsing = parseFile(file, { deepScan });
          // parsing takes milliseconds; walk through the steps so it is clear what is being read
          for (let step = 1; step <= steps.length; step++) {
            await sleep(STEP_MS);
            update(entry.id, { step });
          }
          update(entry.id, { status: "done", result: await parsing });
        } catch (error) {
          update(entry.id, { status: "error", error: error instanceof Error ? error.message : String(error) });
        }
      }
    },
    [deepScan],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  useEffect(() => {
    const current = urls.current;
    return () => current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const loadExample = async (file: string) => {
    const response = await fetch(`/examples/${file}`);
    const blob = await response.blob();
    addFiles([new File([blob], file, { type: "image/png" })]);
  };

  const remove = (id: number) =>
    setEntries((current) =>
      current.filter((entry) => {
        if (entry.id !== id) return true;
        URL.revokeObjectURL(entry.url);
        urls.current.delete(entry.url);
        return false;
      }),
    );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <label
        data-dragging={dragging}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
        className="dropzone group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl px-6 py-14 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(124,58,237,0.25)] transition-transform duration-200 data-[dragging=true]:scale-[1.01] sm:py-16"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30 transition-transform duration-200 group-hover:-translate-y-0.5">
          <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18v-1.5M16.5 8.25 12 3.75m0 0L7.5 8.25M12 3.75v12" />
          </svg>
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-lg font-semibold">
            {dragging ? "Drop to read the metadata" : "Drop images here, paste, or click to choose"}
          </span>
          <span className="text-sm text-muted">PNG, JPEG or WEBP. Up to {MAX_FILES} at once.</span>
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </label>

      <div className="flex flex-col gap-4 text-sm text-muted sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <span>No image handy? Try one of these:</span>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {EXAMPLES.map((example) => (
              <button
                key={example.file}
                type="button"
                onClick={() => loadExample(example.file)}
                className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card p-1.5 pr-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small static example */}
                <img src={`/examples/${example.file}`} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-xs font-semibold text-foreground group-hover:text-accent">{example.name}</span>
                  <span className="truncate text-[11px] text-muted sm:max-w-36">{example.prompt}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2" title="Also reads stealth metadata hidden in the alpha channel">
            <span className="relative inline-flex">
              <input
                type="checkbox"
                checked={deepScan}
                onChange={(event) => setDeepScan(event.target.checked)}
                className="peer sr-only"
              />
              <span className="h-5 w-9 rounded-full bg-border transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </span>
            Deep scan
          </label>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => entries.forEach((entry) => remove(entry.id))}
              className="font-medium hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {entries.map((entry) => (
        <ResultCard key={entry.id} entry={entry} onRemove={() => remove(entry.id)} />
      ))}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function Processing({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <div className="h-1.5 overflow-hidden rounded-full bg-card-strong">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(6, (step / steps.length) * 100)}%` }}
        />
      </div>
      <ol className="flex flex-col gap-2.5">
        {steps.map((label, index) => {
          const state = index < step ? "done" : index === step ? "active" : "pending";
          return (
            <li
              key={label}
              className={`flex items-center gap-2.5 text-sm transition-colors ${
                state === "pending" ? "text-muted/60" : state === "active" ? "text-foreground" : "text-muted"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {state === "done" ? (
                  <svg viewBox="0 0 20 20" className="h-5 w-5 text-emerald-500" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.86-9.86a.75.75 0 0 0-1.22-.88l-3.24 4.5-1.62-1.62a.75.75 0 1 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.09l3.75-5.22Z" clipRule="evenodd" />
                  </svg>
                ) : state === "active" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/25 border-t-accent" aria-hidden />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-border" aria-hidden />
                )}
              </span>
              {label}
              {state === "active" && <span className="sr-only">(in progress)</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function GeneratorBadge({ generator }: { generator: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        GENERATOR_STYLES[generator] ?? "bg-accent-soft text-accent ring-accent/25"
      }`}
    >
      {generator}
    </span>
  );
}

function ResultCard({ entry, onRemove }: { entry: Entry; onRemove: () => void }) {
  const info = entry.result?.promptInfo ?? null;

  return (
    <article className="animate-fade-up overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-6 p-4 sm:flex-row sm:p-6">
        <div className="flex items-center gap-3 sm:w-52 sm:shrink-0 sm:flex-col sm:items-stretch">
          <div className="checkerboard relative w-20 shrink-0 overflow-hidden rounded-xl sm:w-full sm:rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
            <img
              src={entry.url}
              alt={entry.name}
              className={`aspect-square w-full object-contain transition-[filter] duration-500 ${
                entry.status === "parsing" ? "brightness-75 saturate-50" : ""
              }`}
            />
            {entry.status === "parsing" && (
              <div className="scan-overlay pointer-events-none absolute inset-0" aria-hidden>
                <div className="scan-line" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium" title={entry.name}>
              {entry.name}
            </h3>
            <p className="text-xs text-muted">
              {entry.result?.format ?? "Image"} · {formatBytes(entry.size)}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex items-center justify-between gap-3">
            {info ? (
              <GeneratorBadge generator={info.generator} />
            ) : (
              <span className="text-sm font-medium text-muted">
                {entry.status === "parsing" ? "Reading metadata…" : entry.status === "error" ? "Error" : "No metadata"}
              </span>
            )}
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-card-strong hover:text-foreground"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </header>

          {entry.status === "parsing" && <Processing steps={entry.steps ?? ["Reading file"]} step={entry.step ?? 0} />}
          {entry.status === "error" && (
            <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              Could not read this image: {entry.error}
            </p>
          )}
          {entry.status === "done" && !info && (
            <p className="rounded-xl bg-card-strong px-4 py-3 text-sm text-muted">
              {entry.result?.format
                ? "No generation metadata found. The image may have been re-saved or stripped by the site it came from."
                : "This file is not a PNG, JPEG or WEBP image."}
            </p>
          )}
          {info && <PromptDetails info={info} name={entry.name} />}
        </div>
      </div>
    </article>
  );
}

function PromptDetails({ info, name }: { info: PromptInfo; name: string }) {
  const prompt = getFullPrompt(info);
  const negative = getFullNegativePrompt(info);
  const models = getModels(info);
  const json = JSON.stringify(promptInfoToDict(info), null, 2);

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: `${name.replace(/\.[^.]+$/, "")}.json`,
    });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      <TextBlock title="Prompt" text={prompt} />
      {negative && <TextBlock title="Negative prompt" text={negative} negative />}

      {models.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {models.length > 1 ? "Models" : "Model"}
          </h4>
          <div className="flex flex-wrap gap-2">
            {models.map((model, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card-strong px-2.5 py-1.5 font-mono text-xs"
                title={model.hash}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 text-accent" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
                  <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v18m8-13.5-8 4.5-8-4.5" />
                </svg>
                {modelToString(model)}
                {model.name && model.hash ? <span className="text-muted">{model.hash}</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}

      {info.samplers.map((sampler, index) => (
        <div key={index}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {info.samplers.length > 1 ? `Sampler ${index + 1}` : "Sampler"}
            <span className="ml-2 font-mono normal-case tracking-normal text-foreground">{sampler.name}</span>
          </h4>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(sampler.parameters).map(([key, value]) => (
              <div key={key} className="min-w-0 rounded-xl border border-border bg-card-strong/60 px-3 py-2">
                <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">
                  {key.replaceAll("_", " ")}
                </dt>
                <dd className="truncate font-mono text-sm" title={formatValue(value)}>
                  {formatValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
        {Object.keys(info.metadata).length > 0 && (
          <Disclosure title={`Other metadata (${Object.keys(info.metadata).length})`}>
            <dl className="grid gap-2">
              {Object.entries(info.metadata).map(([key, value]) => (
                <div key={key} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                  <dt className="text-xs text-muted">{key}</dt>
                  <dd className="break-words font-mono text-xs">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </Disclosure>
        )}
        <Disclosure title="Raw JSON">
          <pre className="max-h-96 overflow-auto rounded-lg bg-code p-3 font-mono text-xs text-code-foreground">{json}</pre>
        </Disclosure>
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={json} label="Copy JSON" />
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
          </svg>
          Download JSON
        </button>
      </div>
    </div>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-card-strong hover:text-foreground [&::-webkit-details-marker]:hidden">
        {title}
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 transition-transform group-open:rotate-180" fill="currentColor">
          <path d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

function TextBlock({ title, text, negative = false }: { title: string; text: string; negative?: boolean }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${negative ? "bg-rose-500" : "bg-emerald-500"}`} aria-hidden />
          {title}
        </h4>
        {text && <CopyButton text={text} />}
      </div>
      <p className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-card-strong/60 p-3.5 text-[15px] leading-relaxed">
        {text || <span className="text-muted">(empty)</span>}
      </p>
    </section>
  );
}
