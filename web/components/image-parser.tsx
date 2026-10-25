"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const MAX_FILES = 20;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

interface Entry {
  id: number;
  name: string;
  size: number;
  url: string;
  status: "parsing" | "done" | "error";
  result?: ParseResult;
  error?: string;
}

let nextId = 0;

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
          update(entry.id, { status: "done", result: await parseFile(file, { deepScan }) });
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
    <div className="flex flex-col gap-6">
      <label
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
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-border bg-card hover:border-accent"
        }`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-10 w-10 text-accent" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V18a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18v-1.5M16.5 8.25 12 3.75m0 0L7.5 8.25M12 3.75v12" />
        </svg>
        <span className="text-lg font-medium">Drop images here, paste, or click to choose</span>
        <span className="text-sm text-muted">PNG, JPEG or WEBP. Up to {MAX_FILES} at once.</span>
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={deepScan}
            onChange={(event) => setDeepScan(event.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Deep scan (also reads stealth metadata hidden in the alpha channel)
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

function ResultCard({ entry, onRemove }: { entry: Entry; onRemove: () => void }) {
  const info = entry.result?.promptInfo ?? null;

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-6 p-5 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
        <img
          src={entry.url}
          alt={entry.name}
          className="h-40 w-full rounded-xl bg-background object-contain sm:h-48 sm:w-48 sm:shrink-0"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-medium" title={entry.name}>
                {entry.name}
              </h3>
              <p className="text-sm text-muted">
                {entry.result?.format ?? "Image"} · {formatBytes(entry.size)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {info && (
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                  {info.generator}
                </span>
              )}
              <button type="button" onClick={onRemove} aria-label="Remove" className="rounded-md p-1 text-muted hover:text-foreground">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
          </header>

          {entry.status === "parsing" && <p className="text-sm text-muted">Reading metadata…</p>}
          {entry.status === "error" && <p className="text-sm text-red-500">Could not read this image: {entry.error}</p>}
          {entry.status === "done" && !info && (
            <p className="text-sm text-muted">
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
    <div className="flex flex-col gap-4">
      <TextBlock title="Prompt" text={prompt} />
      {negative && <TextBlock title="Negative prompt" text={negative} />}

      {models.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {models.map((model, index) => (
            <span key={index} className="rounded-md border border-border px-2 py-1 font-mono text-xs" title={model.hash}>
              {modelToString(model)}
              {model.name && model.hash ? <span className="text-muted"> · {model.hash}</span> : null}
            </span>
          ))}
        </div>
      )}

      {info.samplers.map((sampler, index) => (
        <div key={index}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {info.samplers.length > 1 ? `Sampler ${index + 1}: ` : "Sampler: "}
            <span className="normal-case text-foreground">{sampler.name}</span>
          </h4>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(sampler.parameters).map(([key, value]) => (
              <div key={key} className="min-w-0 rounded-lg bg-background px-3 py-2">
                <dt className="text-xs text-muted">{key.replaceAll("_", " ")}</dt>
                <dd className="truncate font-mono text-sm" title={formatValue(value)}>
                  {formatValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {Object.keys(info.metadata).length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted hover:text-foreground">
            Other metadata ({Object.keys(info.metadata).length})
          </summary>
          <dl className="mt-2 grid gap-2">
            {Object.entries(info.metadata).map(([key, value]) => (
              <div key={key} className="grid gap-1 rounded-lg bg-background px-3 py-2 sm:grid-cols-[12rem_1fr]">
                <dt className="text-xs text-muted">{key}</dt>
                <dd className="break-words font-mono text-xs">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium text-muted hover:text-foreground">Raw JSON</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-background p-3 font-mono text-xs">{json}</pre>
      </details>

      <div className="flex gap-2">
        <CopyButton text={json} label="Copy JSON" />
        <button
          type="button"
          onClick={download}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Download JSON
        </button>
      </div>
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
        {text && <CopyButton text={text} />}
      </div>
      <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-sm">
        {text || <span className="text-muted">(empty)</span>}
      </p>
    </section>
  );
}
