import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  DocumentContentSchema, DocumentPageSchema, DocumentPreviewSchema, FileExtractionSchema,
  FileReviewSchema, ReviewFileSchema, ReviewRasterImageSchema, reviewRasterDataUrl,
  sameReviewFile, stableReviewKey, type DocumentContent, type ReviewRasterImage,
} from "./file-review-schemas.js";

const file = { id: "file-1", revision: "revision-1", name: "Authored invoice.pdf", bytes: 0, mimeType: "application/pdf" };
const actualPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQVDL+DwACFAFmBODefwAAAABJRU5ErkJggg==";
const b64 = (value: Uint8Array) => Buffer.from(value).toString("base64");
function join(...values: Uint8Array[]) {
  const result = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) { result.set(value, offset); offset += value.length; }
  return result;
}
function be32(value: number) { return new Uint8Array([value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255]); }
function le32(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24]); }
const ascii = (value: string) => new Uint8Array([...value].map(character => character.charCodeAt(0)));
function pngHeader(width = 1, height = 1, length = 33) {
  const bytes = new Uint8Array(length);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  bytes.set(be32(width), 16); bytes.set(be32(height), 20); bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}
function image(mimeType: ReviewRasterImage["mimeType"], width: number, height: number, bytes: Uint8Array): ReviewRasterImage {
  return { mimeType, width, height, base64: b64(bytes), alt: "Authored raster page" };
}
const png = (width = 1, height = 1, length = 33) => image("image/png", width, height, pngHeader(width, height, length));
function jpeg(width = 3, height = 2, marker = 192) {
  return new Uint8Array([255, 216, 255, 224, 0, 4, 0, 0, 255, marker, 0, 11, 8, height >>> 8, height & 255, width >>> 8, width & 255, 1, 1, 17, 0]);
}
function webpChunk(kind: string, payload: Uint8Array) {
  return join(ascii(kind), le32(payload.length), payload, payload.length % 2 ? new Uint8Array([0]) : new Uint8Array());
}
function webp(kind: string, payload: Uint8Array, ...extra: Uint8Array[]) {
  const chunks = join(webpChunk(kind, payload), ...extra);
  return join(ascii("RIFF"), le32(4 + chunks.length), ascii("WEBP"), chunks);
}
function lossless(width = 3, height = 2) {
  return join(new Uint8Array([47]), le32((width - 1) | (height - 1) << 14));
}
function extended(width = 3, height = 2, flags = 0) {
  return new Uint8Array([flags, 0, 0, 0, width - 1 & 255, (width - 1) >>> 8 & 255, (width - 1) >>> 16, height - 1 & 255, (height - 1) >>> 8 & 255, (height - 1) >>> 16]);
}
function pngChunk(kind: string, payload: Uint8Array) {
  const body = join(ascii(kind), payload);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return join(be32(payload.length), body, be32((crc ^ 0xffffffff) >>> 0));
}
function apng() {
  const pngBytes = new Uint8Array(Buffer.from(actualPngBase64, "base64"));
  const frame = new Uint8Array(26);
  frame.set(be32(1), 4); frame.set(be32(1), 8); frame[21] = 1; frame[23] = 10;
  return join(pngBytes.subarray(0, 33), pngChunk("acTL", join(be32(1), be32(0))), pngChunk("fcTL", frame), pngBytes.subarray(33));
}
function preview(content: DocumentContent = { type: "text", text: "Authored document" }) {
  return { id: "preview-1", title: "Review the document", file, state: "ready" as const, content };
}
function extraction() {
  return { id: "extraction-1", revision: "extraction-revision-1", fileId: file.id, fileRevision: file.revision,
    fields: [{ id: "subject", label: "Subject", original: "Authored extraction", value: "Reviewed extraction", required: true }] };
}
function review() { return { id: "review-1", title: "Review file values", file, preview: preview(), extraction: extraction() }; }
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function previewAtBudget(outer: boolean) {
  const content: DocumentContent = { type: "pages", pages: Array.from({ length: 20 }, (_, index) => ({ id: `page-${index}`, label: `Page ${index}`, text: "" })) };
  const value = preview(content);
  const baseline = outer ? FileReviewSchema.parse({ ...review(), preview: value }) : DocumentPreviewSchema.parse(value);
  let remaining = 2097152 - byteLength(baseline);
  if (content.type !== "pages") throw new Error("fixture_pages_required");
  for (const page of content.pages) {
    const bytes = Math.min(remaining, 131072);
    page.text = "é".repeat(Math.floor(bytes / 2)) + (bytes % 2 ? "a" : "");
    remaining -= bytes;
  }
  if (remaining !== 0) throw new Error("fixture_budget_unfilled");
  return value;
}

describe("file-review schemas", () => {
  it("accepts complete reported file descriptors including zero bytes and unknown MIME", () => {
    expect(ReviewFileSchema.parse(file)).toEqual(file);
    expect(ReviewFileSchema.parse({ ...file, id: "x".repeat(128), revision: "y".repeat(128), bytes: Number.MAX_SAFE_INTEGER, mimeType: "" }).bytes).toBe(Number.MAX_SAFE_INTEGER);
    expect(ReviewFileSchema.parse({ id: "file", revision: "revision", name: "Name", bytes: 0 }).mimeType).toBeUndefined();
  });
  it("rejects untrimmed controlled oversized and blank file identities or names", () => {
    for (const id of ["", " file", "file ", "file\n", "x".repeat(129)]) expect(ReviewFileSchema.safeParse({ ...file, id }).success).toBe(false);
    for (const patch of [{ revision: "\t" }, { name: " " }, { name: "x".repeat(501) }, { mimeType: "x".repeat(121) }]) expect(ReviewFileSchema.safeParse({ ...file, ...patch }).success).toBe(false);
  });
  it("refuses unknown descriptor properties and invalid reported byte counts", () => {
    expect(ReviewFileSchema.safeParse({ ...file, path: "/private/file.pdf" }).success).toBe(false);
    for (const bytes of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) expect(ReviewFileSchema.safeParse({ ...file, bytes }).success).toBe(false);
  });
  it("compares every complete file descriptor property without equating absence and empty MIME", () => {
    expect(sameReviewFile(file, { ...file })).toBe(true);
    for (const patch of [{ id: "other" }, { revision: "other" }, { name: "other" }, { bytes: 1 }, { mimeType: "" }]) expect(sameReviewFile(file, { ...file, ...patch })).toBe(false);
    expect(sameReviewFile(null, null)).toBe(false);
    expect(sameReviewFile({ ...file, mimeType: undefined }, { ...file, mimeType: "" })).toBe(false);
  });
  it("accepts the authored one-pixel PNG and creates only a validated inline raster URL", () => {
    const raster = { ...png(), base64: actualPngBase64 };
    expect(ReviewRasterImageSchema.parse(raster)).toEqual(raster);
    expect(reviewRasterDataUrl(raster)).toBe(`data:image/png;base64,${actualPngBase64}`);
    expect(reviewRasterDataUrl({ ...raster, base64: "https://example.com/file.png" })).toBeUndefined();
    expect(reviewRasterDataUrl({ ...raster, mimeType: "image/svg+xml" })).toBeUndefined();
  });
  it("recognizes PNG color headers and APNG declarations without claiming frame decoding", () => {
    for (const [depth, color] of [[1, 0], [16, 2], [4, 3], [8, 4], [8, 6]]) {
      const bytes = pngHeader(); bytes[24] = depth!; bytes[25] = color!;
      expect(ReviewRasterImageSchema.safeParse(image("image/png", 1, 1, bytes)).success).toBe(true);
    }
    expect(ReviewRasterImageSchema.safeParse(image("image/png", 1, 1, apng())).success).toBe(true);
  });
  it("refuses truncated PNG signatures and invalid IHDR header fields", () => {
    const bytes = pngHeader();
    expect(ReviewRasterImageSchema.safeParse(image("image/png", 1, 1, bytes.subarray(0, 32))).success).toBe(false);
    for (const [offset, replacement] of [[0, 0], [11, 12], [12, 0], [24, 3], [25, 1], [26, 1], [27, 1], [28, 2]]) {
      const invalid = bytes.slice(); invalid[offset!] = replacement!;
      expect(ReviewRasterImageSchema.safeParse(image("image/png", 1, 1, invalid)).success).toBe(false);
    }
  });
  it("refuses declared dimensions or MIME types that disagree with the actual header", () => {
    expect(ReviewRasterImageSchema.safeParse({ ...png(), width: 2 }).success).toBe(false);
    expect(ReviewRasterImageSchema.safeParse({ ...png(), mimeType: "image/jpeg" }).success).toBe(false);
    expect(ReviewRasterImageSchema.safeParse({ ...png(), mimeType: "image/webp" }).success).toBe(false);
    expect(ReviewRasterImageSchema.safeParse({ ...png(), alt: " " }).success).toBe(false);
  });
  it("enforces the exact per-image decoded byte limit independently of encoded length", () => {
    expect(ReviewRasterImageSchema.safeParse(png(1, 1, 262144)).success).toBe(true);
    expect(ReviewRasterImageSchema.safeParse(png(1, 1, 262145)).success).toBe(false);
  });
  it("enforces nonzero side limits and the eight-million-pixel boundary", () => {
    expect(ReviewRasterImageSchema.safeParse(png(4096, 1)).success).toBe(true);
    expect(ReviewRasterImageSchema.safeParse(png(4000, 2000)).success).toBe(true);
    for (const [width, height] of [[0, 1], [4097, 1], [4000, 2001]]) expect(ReviewRasterImageSchema.safeParse(png(width, height)).success).toBe(false);
  });
  it("refuses noncanonical base64 whitespace alphabets prefixes and nonzero padding bits", () => {
    const valid = png(1, 1, 34).base64;
    const maximumMalformed = png(1, 1, 262144).base64.slice(0, -1) + "?";
    for (const base64 of [valid + "\n", valid.replace("+", "-") + "_", `data:image/png;base64,${valid}`, valid.slice(0, -1), valid.slice(0, -3) + "B==", maximumMalformed, "====", ""]) {
      expect(ReviewRasterImageSchema.safeParse({ ...png(), base64 }).success).toBe(false);
    }
  });
  it("reads baseline and progressive JPEG frames after bounded application segments", () => {
    for (const marker of [192, 194]) expect(ReviewRasterImageSchema.safeParse(image("image/jpeg", 3, 2, jpeg(3, 2, marker))).success).toBe(true);
    const bytes = jpeg();
    const filled = join(bytes.subarray(0, 8), new Uint8Array([255]), bytes.subarray(8));
    expect(ReviewRasterImageSchema.safeParse(image("image/jpeg", 3, 2, filled)).success).toBe(true);
  });
  it("refuses malformed JPEG markers segment lengths precision and component headers", () => {
    for (const bytes of [new Uint8Array([255, 216, 255]), new Uint8Array([255, 216, 255, 218]), new Uint8Array([255, 216, 255, 0]), jpeg().subarray(0, 20)]) expect(ReviewRasterImageSchema.safeParse(image("image/jpeg", 3, 2, bytes)).success).toBe(false);
    for (const [offset, replacement] of [[5, 1], [5, 250], [11, 10], [12, 0], [17, 0], [17, 2]]) {
      const bytes = jpeg(); bytes[offset!] = replacement!;
      expect(ReviewRasterImageSchema.safeParse(image("image/jpeg", 3, 2, bytes)).success).toBe(false);
    }
  });
  it("refuses JPEG header dimensions that are zero oversized or differently declared", () => {
    for (const [width, height] of [[0, 2], [5000, 2]] as const) expect(ReviewRasterImageSchema.safeParse(image("image/jpeg", width, height, jpeg(width, height))).success).toBe(false);
    expect(ReviewRasterImageSchema.safeParse(image("image/jpeg", 4, 2, jpeg())).success).toBe(false);
  });
  it("reads both lossy and lossless WebP primary frame dimensions", () => {
    const lossy = new Uint8Array([16, 0, 0, 157, 1, 42, 3, 0, 2, 0]);
    expect(ReviewRasterImageSchema.safeParse(image("image/webp", 3, 2, webp("VP8 ", lossy))).success).toBe(true);
    expect(ReviewRasterImageSchema.safeParse(image("image/webp", 3, 2, webp("VP8L", lossless()))).success).toBe(true);
  });
  it("reads extended WebP canvas and animation declarations without interpreting frames", () => {
    expect(ReviewRasterImageSchema.safeParse(image("image/webp", 3, 2, webp("VP8X", extended()))).success).toBe(true);
    const frame = new Uint8Array(16); frame[6] = 2; frame[9] = 1; frame[12] = 100;
    const animated = webp("VP8X", extended(3, 2, 2), webpChunk("ANIM", new Uint8Array(6)), webpChunk("ANMF", join(frame, webpChunk("VP8L", lossless()))));
    expect(ReviewRasterImageSchema.safeParse(image("image/webp", 3, 2, animated)).success).toBe(true);
  });
  it("refuses WebP RIFF length chunk overflow truncation and nonzero padding", () => {
    const valid = webp("VP8L", lossless());
    expect(ReviewRasterImageSchema.safeParse(image("image/webp", 3, 2, valid.subarray(0, 19))).success).toBe(false);
    for (const [offset, replacement] of [[0, 0], [4, 0], [8, 0], [16, 250], [25, 1]]) {
      const bytes = valid.slice(); bytes[offset!] = replacement!;
      expect(ReviewRasterImageSchema.safeParse(image("image/webp", 3, 2, bytes)).success).toBe(false);
    }
  });
  it("refuses WebP reserved bits lossless versions and invalid lossy frame signatures", () => {
    for (const payload of [extended(3, 2, 1), extended(3, 2, 128), new Uint8Array(9)]) expect(ReviewRasterImageSchema.safeParse(image("image/webp", 3, 2, webp("VP8X", payload))).success).toBe(false);
    const badVersion = lossless(); badVersion[4] = 32;
    expect(ReviewRasterImageSchema.safeParse(image("image/webp", 3, 2, webp("VP8L", badVersion))).success).toBe(false);
    expect(ReviewRasterImageSchema.safeParse(image("image/webp", 3, 2, webp("VP8 ", new Uint8Array(10)))).success).toBe(false);
  });
  it("keeps header-only acceptance distinct from complete raster decoding", () => {
    // This bounded IHDR has no pixel data: the component must still expose browser decode failure.
    expect(ReviewRasterImageSchema.safeParse(png()).success).toBe(true);
    expect(ReviewRasterImageSchema.safeParse({ ...png(), src: "https://example.com/a.png" }).success).toBe(false);
  });
  it("preserves each explicit preview state and supplies sources only for ready content", () => {
    for (const state of ["loading", "empty", "error", "unsupported"]) {
      const parsed = DocumentPreviewSchema.parse({ id: "preview", title: "Preview", file, state, message: "Consumer report" });
      expect(parsed).not.toHaveProperty("content"); expect(parsed).not.toHaveProperty("sources");
    }
    expect(DocumentPreviewSchema.parse(preview())).toHaveProperty("sources", []);
    expect(DocumentPreviewSchema.safeParse({ id: "preview", title: "Preview", file, state: "error", message: " " }).success).toBe(false);
    expect(DocumentPreviewSchema.safeParse({ id: "preview", title: "Preview", file, state: "unsupported" }).success).toBe(false);
  });
  it("refuses ready-only content sources and selections on every other state", () => {
    for (const state of ["loading", "empty", "error", "unsupported"]) for (const extra of [{ content: { type: "text", text: "" } }, { sources: [] }, { selectedPageId: "page" }, { selectedSourceId: "source" }]) {
      expect(DocumentPreviewSchema.safeParse({ id: "preview", title: "Preview", file, state, message: "Reported state", ...extra }).success).toBe(false);
    }
  });
  it("requires ready content and rejects UI properties or unowned preview DTO keys", () => {
    expect(DocumentPreviewSchema.safeParse({ ...preview(), content: undefined }).success).toBe(false);
    for (const extra of [{ busy: true }, { error: "UI error" }, { className: "x" }, { onAction() {} }, { url: "https://example.com" }]) expect(DocumentPreviewSchema.safeParse({ ...preview(), ...extra }).success).toBe(false);
  });
  it("preserves full text including empty strings and enforces UTF-16 text limits", () => {
    expect(DocumentContentSchema.parse({ type: "text", text: "" })).toEqual({ type: "text", text: "" });
    const text = "🙂".repeat(32768);
    expect(DocumentPreviewSchema.safeParse(preview({ type: "text", text })).success).toBe(true);
    expect(DocumentContentSchema.safeParse({ type: "text", text: text + "x" }).success).toBe(false);
  });
  it("preserves falsy structured JSON and retains the existing bounded JSON rules", () => {
    for (const value of [null, false, 0, "", [], {}, { nested: [null, false, 0, ""] }]) expect(DocumentContentSchema.parse({ type: "json", value })).toEqual({ type: "json", value });
    for (const value of [undefined, NaN, Infinity, new Date(), "x".repeat(10001), Array.from({ length: 201 }, () => 0)]) expect(DocumentContentSchema.safeParse({ type: "json", value }).success).toBe(false);
  });
  it("enforces strict discriminated content and finite page collection sizes", () => {
    for (const content of [{ type: "html", text: "<script>" }, { type: "text", text: "ok", value: 0 }, { type: "json", value: null, url: "x" }, { type: "pages", pages: [] }, { type: "pages", pages: Array.from({ length: 21 }, (_, index) => ({ id: `p${index}`, label: "Page", text: "" })) }]) expect(DocumentContentSchema.safeParse(content).success).toBe(false);
  });
  it("preserves page order and both representations while requiring unique current page identities", () => {
    const pages = [{ id: "second", label: "Second", text: "", image: png() }, { id: "first", label: "First", text: "Full text" }];
    expect(DocumentContentSchema.parse({ type: "pages", pages })).toEqual({ type: "pages", pages });
    expect(DocumentPageSchema.safeParse({ id: "p", label: "Page" }).success).toBe(false);
    expect(DocumentPageSchema.safeParse({ id: "p", label: "Page", text: "", html: "x" }).success).toBe(false);
    expect(DocumentContentSchema.safeParse({ type: "pages", pages: [pages[0], pages[0]] }).success).toBe(false);
  });
  it("enforces the exact one-MiB collective raster limit across ordered pages", () => {
    const pages = Array.from({ length: 4 }, (_, index) => ({ id: `p${index}`, label: "Page", image: png(1, 1, 262144) }));
    expect(DocumentContentSchema.safeParse({ type: "pages", pages }).success).toBe(true);
    expect(DocumentContentSchema.safeParse({ type: "pages", pages: [...pages, { id: "extra", label: "Extra", image: png() }] }).success).toBe(false);
  });
  it("allows page selection only for an existing page in paginated content", () => {
    const content: DocumentContent = { type: "pages", pages: [{ id: "p", label: "Page", text: "" }] };
    expect(DocumentPreviewSchema.safeParse({ ...preview(content), selectedPageId: "p" }).success).toBe(true);
    expect(DocumentPreviewSchema.safeParse({ ...preview(content), selectedPageId: "other" }).success).toBe(false);
    expect(DocumentPreviewSchema.safeParse({ ...preview(), selectedPageId: "p" }).success).toBe(false);
  });
  it("binds unique source selections to the current supplied snippets", () => {
    const sources = [{ id: "source", label: "Snippet", text: "Full excerpt" }];
    expect(DocumentPreviewSchema.safeParse({ ...preview(), sources, selectedSourceId: "source" }).success).toBe(true);
    expect(DocumentPreviewSchema.safeParse({ ...preview(), sources, selectedSourceId: "other" }).success).toBe(false);
    expect(DocumentPreviewSchema.safeParse({ ...preview(), sources: [...sources, ...sources] }).success).toBe(false);
    expect(DocumentPreviewSchema.safeParse({ ...preview(), sources: Array.from({ length: 21 }, (_, index) => ({ id: `s${index}`, label: "Snippet", text: "" })) }).success).toBe(false);
  });
  it("checks source page references full text bounds and strict URL-free snippet shapes", () => {
    const source = { id: "s", label: "L".repeat(500), text: "x".repeat(4000), pageId: "p" };
    const paged = preview({ type: "pages", pages: [{ id: "p", label: "Page", text: "" }] });
    expect(DocumentPreviewSchema.safeParse({ ...paged, sources: [source] }).success).toBe(true);
    for (const patch of [{ pageId: "missing" }, { text: "x".repeat(4001) }, { label: "x".repeat(501) }, { url: "https://example.com" }]) expect(DocumentPreviewSchema.safeParse({ ...paged, sources: [{ ...source, ...patch }] }).success).toBe(false);
    expect(DocumentPreviewSchema.safeParse({ ...preview(), sources: [source] }).success).toBe(false);
  });
  it("enforces the complete preview UTF-8 budget at the exact byte boundary", () => {
    const value = previewAtBudget(false);
    expect(byteLength(DocumentPreviewSchema.parse(value))).toBe(2097152);
    if (value.content.type !== "pages") throw new Error("fixture_pages_required");
    value.content.pages[19]!.text += "x";
    expect(DocumentPreviewSchema.safeParse(value).success).toBe(false);
  });
  it("never serializes a nested rejected JSON accessor while checking complete budgets", () => {
    let calls = 0;
    const unsafe = Object.defineProperty({}, "secret", { enumerable: true, get() { calls++; return "private"; } });
    expect(DocumentPreviewSchema.safeParse(preview({ type: "json", value: unsafe })).success).toBe(false);
    expect(FileReviewSchema.safeParse({ ...review(), preview: preview({ type: "json", value: unsafe }) }).success).toBe(false);
    expect(calls).toBe(0);
  });
  it("supplies review defaults while refusing preview or extraction without a file", () => {
    expect(FileReviewSchema.parse({ id: "review", title: "Review", file: null })).toEqual({ id: "review", title: "Review", file: null, disabled: false, confirmLabel: "Save reviewed fields", confirmationLabel: "I confirm these reviewed file values." });
    expect(FileReviewSchema.safeParse({ ...review(), file: null }).success).toBe(false);
  });
  it("preserves non-saveable absent preview loading and empty extraction states", () => {
    expect(FileReviewSchema.safeParse({ id: "review", title: "Review", file }).success).toBe(true);
    expect(FileReviewSchema.safeParse({ ...review(), preview: { id: "preview", title: "Preview", file, state: "loading" }, extraction: { ...extraction(), fields: [] } }).success).toBe(true);
  });
  it("represents foreign preview descriptors and extraction revisions as stale supplied input", () => {
    const stale = { ...review(), preview: { ...preview(), file: { ...file, name: "Other name" } }, extraction: { ...extraction(), fileId: "other", fileRevision: "older" } };
    expect(FileReviewSchema.safeParse(stale).success).toBe(true);
    const parsed = FileReviewSchema.parse(stale);
    expect(sameReviewFile(parsed.file, parsed.preview?.file)).toBe(false);
  });
  it("enforces strict extraction records and the separate safe 120-character field contract", () => {
    expect(FileExtractionSchema.safeParse({ ...extraction(), id: "e".repeat(128), revision: "r".repeat(128), fields: [{ id: "f".repeat(120), label: "Field", original: "" }] }).success).toBe(true);
    for (const extra of [{ fields: [{ id: "f".repeat(121), label: "Field", original: "" }] }, { fields: [{ id: "f", label: "Field" }] }, { filePath: "private" }]) expect(FileExtractionSchema.safeParse({ ...extraction(), ...extra }).success).toBe(false);
    expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [{ ...extraction().fields[0], extra: true }] }).success).toBe(false);
  });
  it("retains existing string corrections flags confidence and evidence defaults", () => {
    const parsed = FileExtractionSchema.parse({ ...extraction(), fields: [{ id: "f", label: "Field", original: "", confidence: 0 }] });
    expect(parsed.fields[0]).toEqual({ id: "f", label: "Field", original: "", value: "", required: false, disabled: false, confidence: 0, evidence: [] });
    expect(FileExtractionSchema.parse({ ...extraction(), fields: [{ id: "f", label: "Field", original: "\u0000\n", value: "\u0000\n", confidence: 1 }] }).fields[0]?.value).toBe("\u0000\n");
    for (const patch of [{ value: false }, { value: 0 }, { original: "x".repeat(4001) }, { value: "x".repeat(4001) }, { confidence: -0.1 }, { confidence: 1.1 }, { confidence: Infinity }]) expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [{ ...extraction().fields[0], ...patch }] }).success).toBe(false);
  });
  it("requires unique safe field and evidence identities without cross-field evidence collisions", () => {
    for (const id of ["constructor", "prototype", "__proto__", " field", "field\n"]) expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [{ ...extraction().fields[0], id }] }).success).toBe(false);
    expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [extraction().fields[0], extraction().fields[0]] }).success).toBe(false);
    const evidence = { id: "e", label: "Evidence", text: "" };
    expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [{ ...extraction().fields[0], evidence: [evidence, evidence] }] }).success).toBe(false);
    expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [{ ...extraction().fields[0], evidence: [evidence] }, { id: "other", label: "Other", original: "", evidence: [evidence] }] }).success).toBe(true);
  });
  it("retains safe HTTP evidence links and rejects unsafe URLs unbounded or foreign evidence properties", () => {
    const field = { ...extraction().fields[0], evidence: [{ id: "e", label: "Evidence", url: "https://example.com/path", text: "x".repeat(4000) }] };
    expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [field] }).success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/html,x", "https://user:pass@example.com", " https://example.com", "https://example.com/\n"]) expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [{ ...field, evidence: [{ ...field.evidence[0], url }] }] }).success).toBe(false);
    expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [{ ...field, evidence: [{ ...field.evidence[0], hidden: true }] }] }).success).toBe(false);
    expect(FileExtractionSchema.safeParse({ ...extraction(), fields: [{ ...field, evidence: Array.from({ length: 21 }, (_, index) => ({ id: `e${index}`, label: "Evidence" })) }] }).success).toBe(false);
  });
  it("rejects UI props unknown nested file keys and overflowing extraction collections", () => {
    for (const extra of [{ busy: true }, { error: "UI error" }, { className: "x" }, { onAction() {} }]) expect(FileReviewSchema.safeParse({ ...review(), ...extra }).success).toBe(false);
    expect(FileReviewSchema.safeParse({ ...review(), file: { ...file, path: "private" } }).success).toBe(false);
    expect(FileExtractionSchema.safeParse({ ...extraction(), fields: Array.from({ length: 101 }, (_, index) => ({ id: `f${index}`, label: "Field", original: "" })) }).success).toBe(false);
  });
  it("applies one exact two-MiB budget to the whole review rather than independent nested budgets", () => {
    const value = { ...review(), preview: previewAtBudget(true) };
    expect(byteLength(FileReviewSchema.parse(value))).toBe(2097152);
    if (value.preview.content.type !== "pages") throw new Error("fixture_pages_required");
    value.preview.content.pages[19]!.text += "x";
    expect(FileReviewSchema.safeParse(value).success).toBe(false);
    expect(FileReviewSchema.safeParse({ ...review(), preview: previewAtBudget(false) }).success).toBe(false);
  });
  it("canonicalizes parsed object key order while preserving arrays and meaningful descriptor terms", () => {
    expect(stableReviewKey({ value: { b: 0, a: false }, items: [null, ""] })).toBe(stableReviewKey({ items: [null, ""], value: { a: false, b: 0 } }));
    expect(stableReviewKey({ items: [0, false] })).not.toBe(stableReviewKey({ items: [false, 0] }));
    expect(stableReviewKey(file)).not.toBe(stableReviewKey({ ...file, bytes: 1 }));
    expect(() => stableReviewKey(undefined)).toThrow("file_review_key_invalid");
  });
});
