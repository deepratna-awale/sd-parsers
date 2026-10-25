"use client";

import { useState } from "react";

const TONES = {
  light: "border-border bg-card text-muted hover:border-accent hover:text-accent",
  dark: "border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:text-white",
};

export function CopyButton({
  text,
  label = "Copy",
  tone = "light",
}: {
  text: string;
  label?: string;
  tone?: keyof typeof TONES;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${TONES[tone]}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {copied ? (
          <path d="m5 12 4.5 4.5L19 7" />
        ) : (
          <>
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </>
        )}
      </svg>
      {copied ? "Copied" : label}
    </button>
  );
}
