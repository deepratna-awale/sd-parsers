// Metadata tools of the sd-parsers library, loaded on demand by the result cards.
import { stripMetadata, writeMetadata } from "sd-parsers/writer";
import { toInfotext } from "sd-parsers/infotext";
import type { PromptInfo } from "sd-parsers/data";

/** The image without its metadata */
export async function stripFile(file: Blob): Promise<Blob> {
  return new Blob([stripMetadata(new Uint8Array(await file.arrayBuffer())) as BlobPart], { type: file.type });
}

/** The image with its generation data rewritten as AUTOMATIC1111 parameters */
export async function toA1111File(file: Blob, info: PromptInfo): Promise<Blob> {
  return new Blob([writeMetadata(new Uint8Array(await file.arrayBuffer()), toInfotext(info)) as BlobPart], { type: file.type });
}
