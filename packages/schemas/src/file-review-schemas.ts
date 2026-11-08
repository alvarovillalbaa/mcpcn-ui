import { z } from "zod";
import { InspectableJSONSchema } from "./execution-schemas.js";

const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain = (maximum: number) => z.string().max(maximum).refine(value => !controls.test(value), "Use plain text without unsupported control characters.");
const visible = (maximum: number) => plain(maximum).refine(value => Boolean(value.trim()), "Supply nonblank visible text.");
const identity = z.string().min(1).max(128).refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value), "Use a trimmed identity without control characters.");
const fieldIdentity = identity.max(120).refine(value => !["__proto__", "prototype", "constructor"].includes(value), "Use a safe field or evidence identity of at most 120 characters.");
const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const maximumPayloadBytes = 2 * 1024 * 1024;
const maximumImageBytes = 256 * 1024;
const maximumCollectiveImageBytes = 1024 * 1024;

function payloadBudget(value: unknown, context: z.RefinementCtx) {
  // Invalid nested JSON can still be present here; never serialize a rejected value.
  if (context.issues.length) return;
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength <= maximumPayloadBytes) return;
  } catch { /* A parsed DTO must have an unambiguous JSON representation. */ }
  context.addIssue({ code: "custom", message: "The complete parsed DTO must fit 2 MiB of UTF-8 JSON." });
}

export const ReviewFileSchema = z.object({
  id: identity, revision: identity, name: visible(500), bytes: nonnegativeInteger,
  mimeType: plain(120).optional(),
}).strict();
export type ReviewFile = z.input<typeof ReviewFileSchema>;
export type ParsedReviewFile = z.output<typeof ReviewFileSchema>;

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decodedLength(base64: string) {
  return base64.length / 4 * 3 - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}
function decodeBase64(base64: string): Uint8Array | undefined {
  if (!base64.length || base64.length > 349528 || base64.length % 4 !== 0) return;
  const length = decodedLength(base64), padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  if (length > maximumImageBytes) return;
  // Linear validation avoids engine-dependent regexp backtracking at the byte cap.
  const contentEnd = base64.length - padding;
  for (let index = 0; index < contentEnd; index++) if (alphabet.indexOf(base64[index]!) < 0) return;
  const tail = alphabet.indexOf(base64[base64.length - padding - 1]!);
  if ((padding === 2 && tail % 16 !== 0) || (padding === 1 && tail % 4 !== 0)) return;
  const bytes = new Uint8Array(length);
  let written = 0;
  for (let offset = 0; offset < base64.length; offset += 4) {
    const a = alphabet.indexOf(base64[offset]!), b = alphabet.indexOf(base64[offset + 1]!);
    const c = base64[offset + 2] === "=" ? 0 : alphabet.indexOf(base64[offset + 2]!);
    const d = base64[offset + 3] === "=" ? 0 : alphabet.indexOf(base64[offset + 3]!);
    const value = a * 262144 + b * 4096 + c * 64 + d;
    if (written < length) bytes[written++] = value >>> 16;
    if (written < length) bytes[written++] = value >>> 8 & 255;
    if (written < length) bytes[written++] = value & 255;
  }
  return bytes;
}
const u16be = (bytes: Uint8Array, offset: number) => bytes[offset]! * 256 + bytes[offset + 1]!;
const u16le = (bytes: Uint8Array, offset: number) => bytes[offset]! + bytes[offset + 1]! * 256;
const u24le = (bytes: Uint8Array, offset: number) => u16le(bytes, offset) + bytes[offset + 2]! * 65536;
const u32be = (bytes: Uint8Array, offset: number) => u16be(bytes, offset) * 65536 + u16be(bytes, offset + 2);
const u32le = (bytes: Uint8Array, offset: number) => u16le(bytes, offset) + u16le(bytes, offset + 2) * 65536;
const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
type Dimensions = { width: number; height: number };

function pngDimensions(bytes: Uint8Array): Dimensions | undefined {
  if (bytes.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    || u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") return;
  const depth = bytes[24]!, color = bytes[25]!;
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!depths[color]?.includes(depth) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28]! > 1) return;
  return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
}
function jpegDimensions(bytes: Uint8Array): Dimensions | undefined {
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) return;
  const frames = new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) return;
    while (bytes[offset] === 255) offset++;
    if (offset >= bytes.length) return;
    const marker = bytes[offset++]!;
    if ([0, 216, 217, 218].includes(marker)) return;
    if (marker === 1 || marker >= 208 && marker <= 215) continue;
    if (offset + 2 > bytes.length) return;
    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return;
    if (frames.has(marker)) {
      if (length < 11) return;
      const precision = bytes[offset + 2]!, components = bytes[offset + 7]!;
      if (precision < 1 || precision > 16 || components < 1 || length !== 8 + 3 * components) return;
      return { width: u16be(bytes, offset + 5), height: u16be(bytes, offset + 3) };
    }
    offset += length;
  }
}
function webpDimensions(bytes: Uint8Array): Dimensions | undefined {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP" || u32le(bytes, 4) !== bytes.length - 8) return;
  let offset = 12, dimensions: Dimensions | undefined;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return;
    const kind = ascii(bytes, offset, 4), size = u32le(bytes, offset + 4), body = offset + 8;
    const end = body + size, padded = end + size % 2;
    if (!/^[\x20-\x7e]{4}$/.test(kind) || end > bytes.length || padded > bytes.length || size % 2 && bytes[end] !== 0) return;
    if (offset === 12) {
      if (kind === "VP8 ") {
        if (size < 10 || bytes[body]! & 1 || (bytes[body]! >> 1 & 7) > 3 || ascii(bytes, body + 3, 3) !== "\x9d\x01\x2a") return;
        dimensions = { width: u16le(bytes, body + 6) & 16383, height: u16le(bytes, body + 8) & 16383 };
      } else if (kind === "VP8L") {
        if (size < 5 || bytes[body] !== 47 || bytes[body + 4]! >> 5 !== 0) return;
        dimensions = { width: 1 + (u16le(bytes, body + 1) & 16383), height: 1 + (u24le(bytes, body + 2) >> 6 & 16383) };
      } else if (kind === "VP8X") {
        if (size !== 10 || bytes[body]! & 193 || bytes[body + 1] !== 0 || bytes[body + 2] !== 0 || bytes[body + 3] !== 0) return;
        dimensions = { width: 1 + u24le(bytes, body + 4), height: 1 + u24le(bytes, body + 7) };
      } else return;
    }
    offset = padded;
  }
  return dimensions;
}

export const ReviewRasterImageSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  base64: z.string().min(1).max(349528),
  width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096),
  alt: visible(2000),
}).strict().superRefine((image, context) => {
  if (image.width * image.height > 8000000) context.addIssue({ code: "custom", path: ["width"], message: "Raster images may contain at most eight million declared pixels." });
  const bytes = decodeBase64(image.base64);
  const dimensions = bytes && (image.mimeType === "image/png" ? pngDimensions(bytes) : image.mimeType === "image/jpeg" ? jpegDimensions(bytes) : webpDimensions(bytes));
  if (!dimensions || dimensions.width !== image.width || dimensions.height !== image.height) context.addIssue({ code: "custom", path: ["base64"], message: "Supply canonical base64 of at most 256 KiB with matching PNG, JPEG or WebP header dimensions." });
}).describe("Canonical bounded raster bytes with matching header dimensions. Header checks do not prove complete image decoding, original-file fidelity or extraction accuracy; animation declarations are not a decoding guarantee.");
export type ReviewRasterImage = z.input<typeof ReviewRasterImageSchema>;
export type ParsedReviewRasterImage = z.output<typeof ReviewRasterImageSchema>;

/** Returns only a header-validated inline raster URL, never a supplied URL or HTML. */
export function reviewRasterDataUrl(value: unknown): string | undefined {
  const parsed = ReviewRasterImageSchema.safeParse(value);
  return parsed.success ? `data:${parsed.data.mimeType};base64,${parsed.data.base64}` : undefined;
}

export const DocumentPageSchema = z.object({
  id: identity, label: visible(500), text: z.string().max(65536).optional(), image: ReviewRasterImageSchema.optional(),
}).strict().refine(page => page.text !== undefined || page.image !== undefined, "A page needs supplied text, a raster image, or both.");
export type DocumentPage = z.input<typeof DocumentPageSchema>;
export type ParsedDocumentPage = z.output<typeof DocumentPageSchema>;
export const DocumentContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(65536) }).strict(),
  z.object({ type: z.literal("json"), value: InspectableJSONSchema }).strict(),
  z.object({ type: z.literal("pages"), pages: z.array(DocumentPageSchema).min(1).max(20) }).strict(),
]).superRefine((content, context) => {
  if (content.type !== "pages") return;
  if (new Set(content.pages.map(page => page.id)).size !== content.pages.length) context.addIssue({ code: "custom", path: ["pages"], message: "Page identities must be unique." });
  const bytes = content.pages.reduce((sum, page) => sum + (page.image ? decodedLength(page.image.base64) : 0), 0);
  if (bytes > maximumCollectiveImageBytes) context.addIssue({ code: "custom", path: ["pages"], message: "Supplied raster images may contain at most 1 MiB decoded collectively." });
});
export type DocumentContent = z.input<typeof DocumentContentSchema>;
export type ParsedDocumentContent = z.output<typeof DocumentContentSchema>;

export const DocumentSourceSchema = z.object({ id: identity, label: visible(500), text: z.string().max(4000), pageId: identity.optional() }).strict();
export type DocumentSource = z.input<typeof DocumentSourceSchema>;
export type ParsedDocumentSource = z.output<typeof DocumentSourceSchema>;
const previewBase = { id: identity, title: visible(240), description: plain(2000).optional(), file: ReviewFileSchema };
export const DocumentPreviewSchema = z.discriminatedUnion("state", [
  z.object({ ...previewBase, state: z.literal("ready"), content: DocumentContentSchema, message: plain(2000).optional(), sources: z.array(DocumentSourceSchema).max(20).default([]), selectedPageId: identity.optional(), selectedSourceId: identity.optional() }).strict(),
  z.object({ ...previewBase, state: z.literal("loading"), message: plain(2000).optional() }).strict(),
  z.object({ ...previewBase, state: z.literal("empty"), message: plain(2000).optional() }).strict(),
  z.object({ ...previewBase, state: z.literal("error"), message: visible(2000) }).strict(),
  z.object({ ...previewBase, state: z.literal("unsupported"), message: visible(2000) }).strict(),
]).superRefine((preview, context) => {
  payloadBudget(preview, context);
  if (preview.state !== "ready") return;
  const pages = preview.content.type === "pages" ? new Set(preview.content.pages.map(page => page.id)) : new Set<string>();
  if (preview.selectedPageId !== undefined && !pages.has(preview.selectedPageId)) context.addIssue({ code: "custom", path: ["selectedPageId"], message: "Select a page in the current paginated content." });
  const sources = new Set(preview.sources.map(source => source.id));
  if (sources.size !== preview.sources.length) context.addIssue({ code: "custom", path: ["sources"], message: "Source identities must be unique." });
  if (preview.selectedSourceId !== undefined && !sources.has(preview.selectedSourceId)) context.addIssue({ code: "custom", path: ["selectedSourceId"], message: "Select a current source." });
  preview.sources.forEach((source, index) => {
    if (source.pageId !== undefined && !pages.has(source.pageId)) context.addIssue({ code: "custom", path: ["sources", index, "pageId"], message: "A source page must belong to the current paginated content." });
  });
}).describe("Strict consumer-supplied document representations and current page/source references, at most 2 MiB parsed UTF-8 JSON. Ready content is not proof of original bytes.");
export type DocumentPreviewData = z.input<typeof DocumentPreviewSchema>;
export type ParsedDocumentPreviewData = z.output<typeof DocumentPreviewSchema>;

const extractionLabel = z.string().min(1).max(300).refine(value => Boolean(value.trim()), "Supply a nonblank extraction label.");
const evidence = z.object({
  id: fieldIdentity, label: extractionLabel, text: z.string().max(4000).optional(),
  url: z.string().max(2048).refine(value => {
    try { const url = new URL(value); return /^https?:\/\//.test(value) && !/[\u0000-\u0020\u007f]/.test(value) && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
    catch { return false; }
  }, "Evidence links must use HTTP or HTTPS without credentials.").optional(),
}).strict();
export const FileExtractionFieldSchema = z.object({
  id: fieldIdentity, label: extractionLabel, original: z.string().max(4000), value: z.string().max(4000).default(""),
  required: z.boolean().default(false), disabled: z.boolean().default(false),
  confidence: z.number().finite().min(0).max(1).optional(),
  evidence: z.array(evidence).max(20).default([]).refine(items => new Set(items.map(item => item.id)).size === items.length, "Evidence identities must be unique per field."),
}).strict();
export const FileExtractionSchema = z.object({
  id: identity, revision: identity, fileId: identity, fileRevision: identity,
  fields: z.array(FileExtractionFieldSchema).max(100),
}).strict().refine(value => new Set(value.fields.map(field => field.id)).size === value.fields.length, "Extracted field identities must be unique.");
export type FileExtractionField = z.input<typeof FileExtractionFieldSchema>;
export type ParsedFileExtractionField = z.output<typeof FileExtractionFieldSchema>;
export type FileExtraction = z.input<typeof FileExtractionSchema>;
export type ParsedFileExtraction = z.output<typeof FileExtractionSchema>;
export const FileReviewSchema = z.object({
  id: identity, title: visible(240), description: plain(2000).optional(), file: ReviewFileSchema.nullable(),
  preview: DocumentPreviewSchema.optional(), extraction: FileExtractionSchema.optional(),
  disabled: z.boolean().default(false), confirmLabel: visible(120).default("Save reviewed fields"),
  confirmationLabel: visible(500).default("I confirm these reviewed file values."),
}).strict().superRefine((review, context) => {
  payloadBudget(review, context);
  if (review.file === null && (review.preview !== undefined || review.extraction !== undefined)) context.addIssue({ code: "custom", path: ["file"], message: "A null file cannot carry preview or extraction data." });
}).describe("Strict file review data with one collective 2 MiB parsed UTF-8 JSON budget. Foreign preview/extraction identities remain representable stale input; the UI must hide foreign data and refuse saving.");
export type FileReviewData = z.input<typeof FileReviewSchema>;
export type ParsedFileReviewData = z.output<typeof FileReviewSchema>;

export function sameReviewFile(left: ReviewFile | null | undefined, right: ReviewFile | null | undefined): boolean {
  return Boolean(left && right && left.id === right.id && left.revision === right.revision && left.name === right.name && left.bytes === right.bytes && left.mimeType === right.mimeType);
}
/** Canonical key for already parsed JSON DTOs. Arrays retain their supplied order. */
export function stableReviewKey(parsedValue: unknown): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value;
  const key = JSON.stringify(canonical(parsedValue));
  if (typeof key !== "string") throw new Error("file_review_key_invalid");
  return key;
}
type DocumentScope = { previewId: string; fileId: string; fileRevision: string };
export type DocumentViewIntent =
  | { type: "document-page-change"; data: DocumentScope & { pageId: string } }
  | { type: "document-source-change"; data: DocumentScope & { sourceId: string; pageId?: string } };
type FileReviewScope = { reviewId: string; fileId: string; fileRevision: string; extractionId: string; extractionRevision: string };
export type FileReviewIntent =
  | { type: "file-correction-change"; data: FileReviewScope & { fieldId: string; value: string } }
  | { type: "save-file-review"; data: FileReviewScope & { values: Record<string, string> } };
