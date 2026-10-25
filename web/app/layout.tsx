import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// every page is prerendered: browsing the site never runs server code
export const ensureStatic = "navigation";

export const metadata: Metadata = {
  title: "sd-parsers: read Stable Diffusion image metadata",
  description:
    "Drop an AI-generated image to see its prompt, sampler settings and models. Supports AUTOMATIC1111, ComfyUI, Fooocus, InvokeAI and NovelAI. Images never leave your browser.",
  metadataBase: new URL("https://sd-parsers.vercel.app"),
  openGraph: {
    title: "sd-parsers",
    description: "Read the prompt and generation settings hidden in Stable Diffusion images.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
