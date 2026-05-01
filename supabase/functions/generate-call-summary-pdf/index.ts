// Server-side Call Summary PDF generator
// Renders rich `ai_analysis.sections` (paragraph/bullets/table/callout)
// with legacy fallback. Returns a PDF binary stream.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "Content-Disposition",
};

// ───── Structured Logger ─────
// Emits single-line JSON per event so logs are queryable by call_id / request_id / event.
// Levels: debug | info | warn | error

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = {
  request_id: string;
  call_id?: string;
  user_id?: string;
  fn: "generate-call-summary-pdf";
};

class StructuredLogger {
  private ctx: LogContext;
  private startedAt: number;
  private dropCounts: Record<string, number> = {};
  private buffer: Array<{
    created_at: string;
    request_id: string;
    call_id: string | null;
    user_id: string | null;
    fn: string;
    level: LogLevel;
    event: string;
    elapsed_ms: number;
    data: Record<string, unknown>;
  }> = [];

  constructor(ctx: LogContext) {
    this.ctx = ctx;
    this.startedAt = Date.now();
  }

  setContext(extra: Partial<LogContext>) {
    this.ctx = { ...this.ctx, ...extra };
  }

  /** Increment a named counter (e.g. "blocks_dropped_invalid_type"). */
  count(key: string, by = 1) {
    this.dropCounts[key] = (this.dropCounts[key] ?? 0) + by;
  }

  counters(): Record<string, number> {
    return { ...this.dropCounts };
  }

  log(level: LogLevel, event: string, data: Record<string, unknown> = {}) {
    const elapsed_ms = Date.now() - this.startedAt;
    const payload = {
      level,
      event,
      elapsed_ms,
      ...this.ctx,
      ...data,
    };
    const line = JSON.stringify(payload);
    // Use console.error for warn+ so they show up in error log views as well
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
    this.buffer.push({
      created_at: new Date().toISOString(),
      request_id: this.ctx.request_id,
      call_id: (this.ctx.call_id as string | undefined) ?? null,
      user_id: (this.ctx.user_id as string | undefined) ?? null,
      fn: this.ctx.fn,
      level,
      event,
      elapsed_ms,
      data,
    });
  }

  debug(event: string, data?: Record<string, unknown>) { this.log("debug", event, data); }
  info(event: string, data?: Record<string, unknown>)  { this.log("info", event, data); }
  warn(event: string, data?: Record<string, unknown>)  { this.log("warn", event, data); }
  error(event: string, data?: Record<string, unknown>) { this.log("error", event, data); }

  /** Flush buffered events to the pdf_endpoint_logs table using a service-role client. */
  async flush() {
    if (this.buffer.length === 0) return;
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const rows = this.buffer.splice(0, this.buffer.length);
    try {
      const admin = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await admin.from("pdf_endpoint_logs").insert(rows);
      if (error) console.error(JSON.stringify({ level: "error", event: "log_flush_failed", error: error.message }));
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "log_flush_exception", error: (e as Error).message }));
    }
  }
}

// ───── Validation ─────

// Strict input validation (rejects malformed requests early)
const RequestSchema = z.object({
  call_id: z.string().trim().uuid({ message: "call_id must be a UUID" }),
});

// Limits — protect server resources from pathological inputs
const MAX_TEXT_LEN = 50_000;            // any single text field
const MAX_TRANSCRIPT_LEN = 500_000;     // ~500KB transcript cap
const MAX_BULLETS = 200;
const MAX_TABLE_ROWS = 500;
const MAX_TABLE_COLS = 12;
const MAX_SECTIONS = 100;
const MAX_BLOCKS_PER_SECTION = 200;

// Coerce anything to a trimmed, length-capped string. Returns "" for null/undefined/objects.
function toStr(v: unknown, max = MAX_TEXT_LEN): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim().slice(0, max);
  if (typeof v === "number" || typeof v === "boolean") return String(v).slice(0, max);
  // For arrays/objects we don't want raw "[object Object]" garbage in the PDF
  return "";
}

// Coerce anything to a string array, dropping empties.
function toStrArray(v: unknown, maxItems = MAX_BULLETS): string[] {
  if (v == null) return [];
  if (typeof v === "string") {
    // Split newlines as a friendly fallback
    return v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, maxItems);
  }
  if (!Array.isArray(v)) return [];
  return v.map((x) => toStr(x)).filter((s) => s.length > 0).slice(0, maxItems);
}

// Forgiving schema for ai_analysis blocks: unknown/invalid blocks are dropped, not rejected.
const ParagraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  text: z.preprocess((v) => toStr(v), z.string()),
}).transform((b) => ({ type: "paragraph" as const, text: b.text }));

const BulletItemSchema = z.preprocess(
  (v) => {
    if (typeof v === "string") return { text: toStr(v) };
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return { label: toStr(o.label) || undefined, text: toStr(o.text) };
    }
    return { text: "" };
  },
  z.object({ label: z.string().optional(), text: z.string() }),
);
const BulletsBlockSchema = z.object({
  type: z.literal("bullets"),
  items: z.preprocess(
    (v) => Array.isArray(v) ? v.slice(0, MAX_BULLETS) : [],
    z.array(BulletItemSchema),
  ),
}).transform((b) => ({
  type: "bullets" as const,
  items: b.items.filter((i) => i.text && i.text.length > 0),
}));

const TableBlockSchema = z.object({
  type: z.literal("table"),
  columns: z.preprocess(
    (v) => Array.isArray(v) ? v.slice(0, MAX_TABLE_COLS).map((c) => toStr(c, 200)) : [],
    z.array(z.string()),
  ),
  rows: z.preprocess(
    (v) => {
      if (!Array.isArray(v)) return [];
      return v.slice(0, MAX_TABLE_ROWS).map((row) =>
        Array.isArray(row)
          ? row.slice(0, MAX_TABLE_COLS).map((c) => toStr(c, 2_000))
          : [],
      );
    },
    z.array(z.array(z.string())),
  ),
}).transform((b) => {
  // Normalize row width to match columns count
  const colCount = b.columns.length || (b.rows[0]?.length ?? 0);
  if (colCount === 0) return null;
  const columns = b.columns.length ? b.columns : Array.from({ length: colCount }, (_, i) => `Col ${i + 1}`);
  const rows = b.rows.map((r) => {
    const padded = r.slice(0, colCount);
    while (padded.length < colCount) padded.push("");
    return padded;
  });
  return { type: "table" as const, columns, rows };
});

const CalloutBlockSchema = z.object({
  type: z.literal("callout"),
  label: z.preprocess((v) => toStr(v) || undefined, z.string().optional()),
  text: z.preprocess((v) => toStr(v), z.string()),
  tone: z.preprocess(
    (v) => {
      const s = typeof v === "string" ? v.toLowerCase() : "";
      return ["info", "success", "warning", "danger"].includes(s) ? s : "info";
    },
    z.enum(["info", "success", "warning", "danger"]),
  ),
}).transform((b) => ({ type: "callout" as const, label: b.label, text: b.text, tone: b.tone }));

const BlockSchema = z.union([
  ParagraphBlockSchema,
  BulletsBlockSchema,
  TableBlockSchema,
  CalloutBlockSchema,
]);

const SectionSchema = z.object({
  number: z.preprocess(
    (v) => (typeof v === "number" || typeof v === "string") ? v : undefined,
    z.union([z.number(), z.string()]).optional(),
  ),
  title: z.preprocess((v) => toStr(v, 300), z.string()),
  blocks: z.preprocess(
    (v) => Array.isArray(v) ? v.slice(0, MAX_BLOCKS_PER_SECTION) : [],
    z.array(z.unknown()),
  ),
});

const AiAnalysisSchema = z.object({
  executive_overview: z.preprocess((v) => toStr(v) || undefined, z.string().optional()),
  executive_summary:  z.preprocess((v) => toStr(v) || undefined, z.string().optional()),
  sentiment:          z.preprocess((v) => toStr(v, 50) || undefined, z.string().optional()),
  next_steps:         z.preprocess((v) => toStr(v) || undefined, z.string().optional()),
  key_takeaways:      z.preprocess((v) => toStrArray(v), z.array(z.string())).optional(),
  key_decisions:      z.preprocess((v) => toStrArray(v), z.array(z.string())).optional(),
  topics_discussed: z.preprocess(
    (v) => Array.isArray(v) ? v.map((t) => {
      if (typeof t === "string") return { topic: toStr(t) };
      if (t && typeof t === "object") {
        const o = t as Record<string, unknown>;
        return { topic: toStr(o.topic), summary: toStr(o.summary) };
      }
      return { topic: "" };
    }).filter((t) => t.topic || (t as any).summary) : [],
    z.array(z.object({ topic: z.string(), summary: z.string().optional() })),
  ).optional(),
  client_commitments: z.preprocess(
    (v) => Array.isArray(v) ? v.map((c) => {
      if (!c || typeof c !== "object") return null;
      const o = c as Record<string, unknown>;
      return { action: toStr(o.action), deadline: toStr(o.deadline), notes: toStr(o.notes) };
    }).filter(Boolean) : [],
    z.array(z.object({ action: z.string(), deadline: z.string(), notes: z.string() })),
  ).optional(),
  vektiss_tasks: z.preprocess(
    (v) => Array.isArray(v) ? v.map((t) => {
      if (!t || typeof t !== "object") return null;
      const o = t as Record<string, unknown>;
      return {
        title: toStr(o.title), assignee: toStr(o.assignee), priority: toStr(o.priority),
        deadline: toStr(o.deadline), description: toStr(o.description),
      };
    }).filter(Boolean) : [],
    z.array(z.object({
      title: z.string(), assignee: z.string(), priority: z.string(),
      deadline: z.string(), description: z.string(),
    })),
  ).optional(),
  sections: z.preprocess(
    (v) => Array.isArray(v) ? v.slice(0, MAX_SECTIONS) : undefined,
    z.array(SectionSchema).optional(),
  ),
}).passthrough();

/**
 * Sanitize ai_analysis from the database. Always returns a valid object.
 * Drops any block / section that fails its sub-schema instead of failing the whole PDF.
 */
function sanitizeAiAnalysis(raw: unknown, logger?: StructuredLogger): AiAnalysis {
  // Accept JSON strings from the DB just in case
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
      logger?.debug("ai_analysis_parsed_from_string", { byte_length: raw.length });
    } catch (e) {
      logger?.warn("ai_analysis_invalid_json_string", { error: (e as Error).message });
      parsed = {};
    }
  }
  if (!parsed || typeof parsed !== "object") {
    logger?.warn("ai_analysis_not_object", { actual_type: parsed === null ? "null" : typeof parsed });
    return {};
  }

  const result = AiAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    logger?.warn("ai_analysis_top_level_validation_failed", {
      field_errors: result.error.flatten().fieldErrors,
    });
    return {};
  }

  const out: AiAnalysis = { ...result.data } as AiAnalysis;

  // Validate blocks per section, logging which ones get dropped
  if (result.data.sections?.length) {
    let totalRawBlocks = 0;
    let totalKeptBlocks = 0;
    let droppedSections = 0;

    out.sections = result.data.sections
      .map((s, sectionIdx) => {
        const blocks: Block[] = [];
        s.blocks.forEach((rawBlock, blockIdx) => {
          totalRawBlocks++;
          const blockType = (rawBlock as { type?: unknown })?.type;
          const r = BlockSchema.safeParse(rawBlock);
          if (r.success && r.data) {
            blocks.push(r.data as Block);
            totalKeptBlocks++;
          } else {
            const reason = !rawBlock || typeof rawBlock !== "object"
              ? "not_an_object"
              : typeof blockType !== "string"
                ? "missing_type"
                : !["paragraph", "bullets", "table", "callout"].includes(String(blockType))
                  ? "unknown_type"
                  : "schema_mismatch";
            logger?.count(`block_dropped_${reason}`);
            logger?.warn("block_dropped", {
              section_index: sectionIdx,
              section_title: s.title,
              block_index: blockIdx,
              raw_type: typeof blockType === "string" ? blockType : null,
              reason,
              zod_errors: r.success ? null : r.error.flatten().formErrors,
            });
          }
        });
        return { number: s.number, title: s.title, blocks };
      })
      .filter((s) => {
        const ok = !!s.title && s.blocks.length > 0;
        if (!ok) {
          droppedSections++;
          logger?.count("section_dropped");
          logger?.warn("section_dropped", {
            section_title: s.title,
            reason: !s.title ? "missing_title" : "no_valid_blocks",
            block_count: s.blocks.length,
          });
        }
        return ok;
      });

    logger?.info("ai_analysis_sections_summary", {
      raw_section_count: result.data.sections.length,
      kept_section_count: out.sections.length,
      dropped_section_count: droppedSections,
      raw_block_count: totalRawBlocks,
      kept_block_count: totalKeptBlocks,
      dropped_block_count: totalRawBlocks - totalKeptBlocks,
    });
  } else {
    logger?.debug("ai_analysis_no_sections", {
      has_legacy_keys: !!(
        result.data.key_takeaways?.length ||
        result.data.topics_discussed?.length ||
        result.data.client_commitments?.length ||
        result.data.vektiss_tasks?.length ||
        result.data.next_steps
      ),
    });
  }

  return out;
}

// ───── Theme ─────
const PRIMARY = rgb(37 / 255, 99 / 255, 235 / 255);
const TEXT = rgb(17 / 255, 24 / 255, 39 / 255);
const MUTED = rgb(107 / 255, 114 / 255, 128 / 255);
const BORDER = rgb(229 / 255, 231 / 255, 235 / 255);
const SURFACE = rgb(249 / 255, 250 / 255, 251 / 255);
const WHITE = rgb(1, 1, 1);

const TONES: Record<string, { bg: ReturnType<typeof rgb>; bar: ReturnType<typeof rgb>; text: ReturnType<typeof rgb> }> = {
  info:    { bg: rgb(239/255,246/255,255/255), bar: rgb(37/255,99/255,235/255),  text: rgb(30/255,58/255,138/255) },
  success: { bg: rgb(236/255,253/255,245/255), bar: rgb(16/255,185/255,129/255), text: rgb(6/255,95/255,70/255) },
  warning: { bg: rgb(255/255,251/255,235/255), bar: rgb(245/255,158/255,11/255), text: rgb(120/255,53/255,15/255) },
  danger:  { bg: rgb(254/255,242/255,242/255), bar: rgb(239/255,68/255,68/255),  text: rgb(127/255,29/255,29/255) },
};

const SENTIMENT_COLORS: Record<string, ReturnType<typeof rgb>> = {
  positive: rgb(16/255,185/255,129/255),
  neutral:  rgb(107/255,114/255,128/255),
  "at-risk":rgb(239/255,68/255,68/255),
  negative: rgb(239/255,68/255,68/255),
  mixed:    rgb(245/255,158/255,11/255),
};

const PAGE_W = 612;  // letter
const PAGE_H = 792;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ───── Helpers ─────

function safeDate(s: string): string {
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  } catch { return s; }
}

function safeDateShort(s: string): string {
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toISOString().slice(0, 10);
  } catch { return s; }
}

// Sanitize string to characters supported by WinAnsi (Helvetica)
function sanitize(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u25E6\u2043\u2219]/g, "-")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    // Drop any remaining non-WinAnsi chars
    .replace(/[^\x00-\xFF]/g, "");
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  const paragraphs = sanitize(text).split(/\r?\n/);
  for (const para of paragraphs) {
    if (!para) { out.push(""); continue; }
    const words = para.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      const w = font.widthOfTextAtSize(candidate, size);
      if (w > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function extractParticipants(transcript?: string | null): string {
  if (!transcript) return "-";
  const re = /\]\s*([^:]+?):/g;
  const set = new Set<string>();
  let m;
  while ((m = re.exec(transcript)) !== null) {
    const name = m[1].trim();
    if (name.length > 0 && name.length < 60) set.add(name);
  }
  return set.size ? Array.from(set).join(", ") : "-";
}

// ───── Types ─────

type Block =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: { label?: string; text: string }[] }
  | { type: "table"; columns: string[]; rows: (string | number | null)[][] }
  | { type: "callout"; label?: string; text: string; tone?: "info" | "success" | "warning" | "danger" };

type Section = { number?: number | string; title: string; blocks: Block[] };

type AiAnalysis = {
  executive_overview?: string;
  sections?: Section[];
  // legacy
  executive_summary?: string;
  sentiment?: string;
  key_takeaways?: string[];
  client_commitments?: { action?: string; deadline?: string; notes?: string }[];
  vektiss_tasks?: { title?: string; assignee?: string; priority?: string; deadline?: string; description?: string }[];
  key_decisions?: string[];
  topics_discussed?: { topic?: string; summary?: string }[];
  next_steps?: string;
};

// ───── PDF Builder ─────

class PdfBuilder {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  fontBold!: PDFFont;
  y = MARGIN;

  async init() {
    this.doc = await PDFDocument.create();
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.fontBold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    // Top brand bar
    this.page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: PRIMARY });
    this.y = PAGE_H - MARGIN;
  }

  ensure(needed: number) {
    if (this.y - needed < MARGIN + 30) this.newPage();
  }

  drawText(text: string, x: number, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const f = opts.font ?? this.font;
    const size = opts.size ?? 10.5;
    const color = opts.color ?? TEXT;
    this.page.drawText(sanitize(text), { x, y: this.y, size, font: f, color });
  }

  brandHeader() {
    this.ensure(30);
    this.y -= 12;
    this.drawText("VEKTISS", MARGIN, { font: this.fontBold, size: 11, color: PRIMARY });
    this.y -= 22;
  }

  title(text: string) {
    const lines = wrapText(this.fontBold, text, 19, CONTENT_W);
    for (const line of lines) {
      this.ensure(26);
      this.drawText(line, MARGIN, { font: this.fontBold, size: 19, color: TEXT });
      this.y -= 24;
    }
    this.y -= 4;
  }

  metaLine(text: string) {
    const lines = wrapText(this.font, text, 10, CONTENT_W);
    for (const line of lines) {
      this.ensure(14);
      this.drawText(line, MARGIN, { font: this.font, size: 10, color: MUTED });
      this.y -= 14;
    }
  }

  link(text: string, url: string) {
    this.ensure(20);
    const sanitized = sanitize(text);
    const size = 10;
    this.drawText(sanitized, MARGIN, { font: this.fontBold, size, color: PRIMARY });
    const w = this.fontBold.widthOfTextAtSize(sanitized, size);
    // Annotate clickable area
    try {
      const ctx = this.doc.context;
      const linkAnnotRef = ctx.register(
        ctx.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [MARGIN, this.y - 2, MARGIN + w, this.y + size + 2],
          Border: [0, 0, 0],
          A: { Type: "Action", S: "URI", URI: url },
        }),
      );
      const AnnotsKey = ctx.obj("Annots") as any;
      let annots: any = this.page.node.get(AnnotsKey);
      if (!annots) {
        annots = ctx.obj([]);
        this.page.node.set(AnnotsKey, annots);
      }
      annots.push(linkAnnotRef);
    } catch (_e) { /* link annotation optional */ }
    this.y -= 18;
  }

  divider() {
    this.ensure(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end:   { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5,
      color: BORDER,
    });
    this.y -= 14;
  }

  sectionHeading(title: string, number?: number | string) {
    this.ensure(40);
    const prefix = number != null ? `${number}. ` : "";
    this.drawText(prefix + title, MARGIN, { font: this.fontBold, size: 14, color: PRIMARY });
    this.y -= 8;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end:   { x: MARGIN + 32, y: this.y },
      thickness: 1.5,
      color: PRIMARY,
    });
    this.y -= 14;
  }

  paragraph(text: string, size = 10.5) {
    const lines = wrapText(this.font, text, size, CONTENT_W);
    for (const line of lines) {
      this.ensure(15);
      this.drawText(line, MARGIN, { font: this.font, size, color: TEXT });
      this.y -= 15;
    }
    this.y -= 4;
  }

  bullets(items: { label?: string; text: string }[]) {
    const size = 10.5;
    const indent = 16;
    for (const item of items) {
      const labelStr = item.label ? `${item.label}: ` : "";
      const fullText = labelStr + (item.text ?? "");
      const lines = wrapText(this.font, fullText, size, CONTENT_W - indent);
      for (let i = 0; i < lines.length; i++) {
        this.ensure(15);
        if (i === 0) {
          this.drawText("-", MARGIN + 2, { font: this.fontBold, size, color: PRIMARY });
        }
        if (i === 0 && item.label) {
          // Draw label bold then remainder normal
          const labelText = `${item.label}:`;
          this.drawText(labelText, MARGIN + indent, { font: this.fontBold, size, color: TEXT });
          const lw = this.fontBold.widthOfTextAtSize(labelText + " ", size);
          const remainder = lines[i].slice(labelStr.length);
          this.page.drawText(sanitize(remainder), {
            x: MARGIN + indent + lw,
            y: this.y, size, font: this.font, color: TEXT,
          });
        } else {
          this.drawText(lines[i], MARGIN + indent, { font: this.font, size, color: TEXT });
        }
        this.y -= 15;
      }
      this.y -= 3;
    }
    this.y -= 3;
  }

  table(columns: string[], rows: (string | number | null)[][]) {
    const colCount = columns.length;
    const colWidth = CONTENT_W / colCount;
    const cellPad = 6;
    const fontSize = 9;
    const headerSize = 9.5;
    const lineHeight = 12;

    // Pre-compute wrapped lines for each cell
    const wrappedRows = rows.map((row) =>
      row.map((cell) => wrapText(this.font, cell == null ? "-" : String(cell), fontSize, colWidth - cellPad * 2)),
    );
    const wrappedHeader = columns.map((c) => wrapText(this.fontBold, c, headerSize, colWidth - cellPad * 2));

    const headerHeight = Math.max(...wrappedHeader.map((l) => l.length)) * lineHeight + cellPad * 2;

    // Draw header
    this.ensure(headerHeight + 30);
    this.page.drawRectangle({
      x: MARGIN, y: this.y - headerHeight,
      width: CONTENT_W, height: headerHeight,
      color: PRIMARY,
    });
    columns.forEach((col, i) => {
      const lines = wrappedHeader[i];
      lines.forEach((line, li) => {
        this.page.drawText(sanitize(line), {
          x: MARGIN + i * colWidth + cellPad,
          y: this.y - cellPad - headerSize - li * lineHeight,
          size: headerSize, font: this.fontBold, color: WHITE,
        });
      });
    });
    this.y -= headerHeight;

    // Draw rows
    wrappedRows.forEach((cells, rIdx) => {
      const rowHeight = Math.max(...cells.map((l) => l.length)) * lineHeight + cellPad * 2;
      // Page break if needed (re-draw header on new page)
      if (this.y - rowHeight < MARGIN + 30) {
        this.newPage();
        // re-draw header
        this.page.drawRectangle({
          x: MARGIN, y: this.y - headerHeight,
          width: CONTENT_W, height: headerHeight,
          color: PRIMARY,
        });
        columns.forEach((col, i) => {
          const lines = wrappedHeader[i];
          lines.forEach((line, li) => {
            this.page.drawText(sanitize(line), {
              x: MARGIN + i * colWidth + cellPad,
              y: this.y - cellPad - headerSize - li * lineHeight,
              size: headerSize, font: this.fontBold, color: WHITE,
            });
          });
        });
        this.y -= headerHeight;
      }

      if (rIdx % 2 === 0) {
        this.page.drawRectangle({
          x: MARGIN, y: this.y - rowHeight,
          width: CONTENT_W, height: rowHeight,
          color: SURFACE,
        });
      }
      cells.forEach((lines, i) => {
        lines.forEach((line, li) => {
          this.page.drawText(sanitize(line), {
            x: MARGIN + i * colWidth + cellPad,
            y: this.y - cellPad - fontSize - li * lineHeight,
            size: fontSize, font: this.font, color: TEXT,
          });
        });
      });
      // Borders
      this.page.drawRectangle({
        x: MARGIN, y: this.y - rowHeight,
        width: CONTENT_W, height: rowHeight,
        borderColor: BORDER, borderWidth: 0.5,
      });
      this.y -= rowHeight;
    });
    this.y -= 12;
  }

  callout(text: string, tone: "info" | "success" | "warning" | "danger" = "info", label?: string) {
    const t = TONES[tone];
    const padding = 12;
    const innerWidth = CONTENT_W - padding * 2 - 4;
    const lineHeight = 14;
    const bodyLines = wrapText(this.font, text, 10, innerWidth);
    const labelLines = label ? 1 : 0;
    const boxHeight = padding * 2 + (labelLines ? lineHeight + 4 : 0) + bodyLines.length * lineHeight;
    this.ensure(boxHeight + 10);
    this.page.drawRectangle({
      x: MARGIN, y: this.y - boxHeight,
      width: CONTENT_W, height: boxHeight,
      color: t.bg,
    });
    this.page.drawRectangle({
      x: MARGIN, y: this.y - boxHeight,
      width: 4, height: boxHeight,
      color: t.bar,
    });
    let cy = this.y - padding - 11;
    if (label) {
      this.page.drawText(sanitize(label), {
        x: MARGIN + padding + 4, y: cy,
        size: 10, font: this.fontBold, color: t.bar,
      });
      cy -= lineHeight + 2;
    }
    for (const line of bodyLines) {
      this.page.drawText(sanitize(line), {
        x: MARGIN + padding + 4, y: cy,
        size: 10, font: this.font, color: t.text,
      });
      cy -= lineHeight;
    }
    this.y -= boxHeight + 10;
  }

  sentimentBadge(sentiment: string) {
    this.ensure(28);
    const label = `Sentiment: ${sentiment}`;
    const c = SENTIMENT_COLORS[sentiment.toLowerCase()] || MUTED;
    const size = 9.5;
    const w = this.fontBold.widthOfTextAtSize(label, size) + 18;
    this.page.drawRectangle({
      x: MARGIN, y: this.y - 16,
      width: w, height: 20, color: c,
    });
    this.page.drawText(sanitize(label), {
      x: MARGIN + 9, y: this.y - 12,
      size, font: this.fontBold, color: WHITE,
    });
    this.y -= 28;
  }

  footers() {
    const pages = this.doc.getPages();
    const total = pages.length;
    pages.forEach((p, idx) => {
      const left = "Vektiss * Meeting Summary";
      const right = `Page ${idx + 1} of ${total}`;
      p.drawText(sanitize(left), {
        x: MARGIN, y: 20, size: 8, font: this.font, color: MUTED,
      });
      const rw = this.font.widthOfTextAtSize(right, 8);
      p.drawText(right, {
        x: PAGE_W - MARGIN - rw, y: 20, size: 8, font: this.font, color: MUTED,
      });
    });
  }
}

// ───── Section assembly ─────

function legacyToSections(ai: AiAnalysis, callType?: string | null, fallbackDecisions?: string[]): Section[] {
  const sections: Section[] = [];
  let n = 1;

  if (ai.key_takeaways?.length) {
    sections.push({ number: n++, title: "Key Takeaways",
      blocks: [{ type: "bullets", items: ai.key_takeaways.map((t) => ({ text: t })) }] });
  }
  if (ai.topics_discussed?.length) {
    const blocks: Block[] = [];
    for (const t of ai.topics_discussed) {
      if (t.topic) blocks.push({ type: "paragraph", text: t.topic });
      if (t.summary) blocks.push({ type: "paragraph", text: t.summary });
    }
    sections.push({ number: n++, title: "Topics Discussed", blocks });
  }
  if (callType === "client_facing" && ai.client_commitments?.length) {
    sections.push({ number: n++, title: "Client Commitments",
      blocks: [{ type: "table", columns: ["Action", "Deadline", "Notes"],
        rows: ai.client_commitments.map((c) => [c.action || "-", c.deadline || "-", c.notes || "-"]) }] });
  }
  if (ai.vektiss_tasks?.length) {
    sections.push({ number: n++, title: "Vektiss Tasks",
      blocks: [{ type: "table", columns: ["Task", "Assignee", "Priority", "Deadline", "Description"],
        rows: ai.vektiss_tasks.map((t) => [t.title || "-", t.assignee || "-", t.priority || "-", t.deadline || "-", t.description || "-"]) }] });
  }
  const decisions = ai.key_decisions?.length ? ai.key_decisions : (fallbackDecisions || []);
  if (decisions.length) {
    sections.push({ number: n++, title: "Key Decisions",
      blocks: [{ type: "bullets", items: decisions.map((d) => ({ text: d })) }] });
  }
  if (ai.next_steps) {
    sections.push({ number: n++, title: "Next Steps",
      blocks: [{ type: "paragraph", text: ai.next_steps }] });
  }
  return sections;
}

// ───── Handler ─────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Use the platform request id if available, else generate one
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = new StructuredLogger({ request_id: requestId, fn: "generate-call-summary-pdf" });
  logger.info("request_received", { method: req.method, url: req.url });

  try {
    const url = new URL(req.url);
    let rawCallId: unknown = url.searchParams.get("call_id");
    if (!rawCallId && req.method === "POST") {
      try {
        const body = await req.json();
        rawCallId = body?.call_id ?? null;
      } catch { /* ignore */ }
    }

    const parsed = RequestSchema.safeParse({ call_id: rawCallId });
    if (!parsed.success) {
      logger.warn("validation_failed_request", {
        field_errors: parsed.error.flatten().fieldErrors,
        raw_call_id_type: typeof rawCallId,
      });
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId } },
      );
    }
    const callId = parsed.data.call_id;
    logger.setContext({ call_id: callId });
    logger.info("validation_passed_request");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logger.warn("auth_missing_bearer");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      logger.warn("auth_invalid_token", { error: authErr?.message });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
      });
    }
    logger.setContext({ user_id: claims.claims.sub });
    logger.info("auth_ok");

    // Fetch call (RLS-scoped via user JWT)
    const { data: call, error: callErr } = await supabase
      .from("call_intelligence")
      .select("*")
      .eq("id", callId)
      .maybeSingle();

    if (callErr || !call) {
      logger.warn("call_fetch_failed", {
        error: callErr?.message,
        not_found: !call && !callErr,
      });
      return new Response(JSON.stringify({ error: callErr?.message || "Call not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
      });
    }
    logger.info("call_fetched", {
      call_type: call.call_type,
      has_transcript: !!call.transcript,
      transcript_length: typeof call.transcript === "string" ? call.transcript.length : 0,
      has_ai_analysis: !!call.ai_analysis,
      ai_analysis_type: typeof call.ai_analysis,
      has_summary: !!call.summary,
      key_decisions_type: Array.isArray(call.key_decisions) ? "array" : typeof call.key_decisions,
      client_id: call.client_id,
      project_id: call.project_id,
    });

    // Fetch related client/project names
    let clientName: string | null = null;
    let projectName: string | null = null;
    if (call.client_id) {
      const { data: c } = await supabase.from("clients").select("name").eq("id", call.client_id).maybeSingle();
      clientName = c?.name ?? null;
    }
    if (call.project_id) {
      const { data: p } = await supabase.from("projects").select("name").eq("id", call.project_id).maybeSingle();
      projectName = p?.name ?? null;
    }

    // Build PDF
    const builder = new PdfBuilder();
    await builder.init();

    builder.brandHeader();
    builder.title(`Meeting Summary - ${safeDate(call.call_date)}`);

    if (call.duration_minutes) builder.metaLine(`Duration: ${call.duration_minutes} minutes`);
    if (clientName) builder.metaLine(`Client: ${clientName}`);
    if (projectName) builder.metaLine(`Project: ${projectName}`);
    builder.metaLine(`Participants: ${extractParticipants(call.transcript)}`);

    if (call.fathom_url || call.fathom_meeting_id) {
      const url = call.fathom_url || `https://fathom.video/calls/${call.fathom_meeting_id}`;
      builder.link("> View Recording in Fathom", url);
    }

    builder.y -= 4;
    builder.divider();

    // Defensive sanitization — never trust DB JSON shape
    const ai: AiAnalysis = sanitizeAiAnalysis(call.ai_analysis, logger);
    const execOverview = toStr(ai.executive_overview) || toStr(ai.executive_summary) || toStr(call.summary);
    if (execOverview) {
      builder.sectionHeading("Executive Overview");
      builder.paragraph(execOverview);
    }

    const sentiment = toStr(ai.sentiment, 50) || toStr(call.sentiment, 50);
    if (sentiment) builder.sentimentBadge(sentiment);

    const fallbackDecisions = toStrArray(call.key_decisions);
    if (call.key_decisions != null && fallbackDecisions.length === 0) {
      logger.warn("key_decisions_unparsable", {
        actual_type: Array.isArray(call.key_decisions) ? "array" : typeof call.key_decisions,
      });
    }

    const sections: Section[] = ai.sections?.length
      ? ai.sections.map((s, i) => ({ number: s.number ?? i + 1, title: s.title, blocks: s.blocks || [] }))
      : legacyToSections(ai, call.call_type, fallbackDecisions);
    logger.info("sections_resolved", {
      source: ai.sections?.length ? "rich_format" : "legacy_fallback",
      section_count: sections.length,
      total_blocks: sections.reduce((n, s) => n + s.blocks.length, 0),
    });

    for (const section of sections) {
      builder.sectionHeading(section.title, section.number);
      for (const block of section.blocks) {
        switch (block.type) {
          case "paragraph": builder.paragraph(block.text); break;
          case "bullets":   builder.bullets(block.items || []); break;
          case "table":     builder.table(block.columns, block.rows); break;
          case "callout":   builder.callout(block.text, block.tone, block.label); break;
        }
      }
      builder.y -= 6;
    }

    const transcriptStr = toStr(call.transcript, MAX_TRANSCRIPT_LEN);
    if (transcriptStr) {
      builder.newPage();
      builder.drawText("Full Transcript", MARGIN, { font: builder.fontBold, size: 14, color: PRIMARY });
      builder.y -= 22;
      const transcriptLines = wrapText(builder.font, transcriptStr, 9, CONTENT_W);
      for (const line of transcriptLines) {
        builder.ensure(12);
        builder.drawText(line, MARGIN, { font: builder.font, size: 9, color: TEXT });
        builder.y -= 12;
      }
      const originalTranscriptLength = typeof call.transcript === "string" ? call.transcript.length : 0;
      if (originalTranscriptLength > MAX_TRANSCRIPT_LEN) {
        builder.y -= 6;
        builder.drawText("[Transcript truncated for length]", MARGIN, { font: builder.font, size: 9, color: MUTED });
        logger.warn("transcript_truncated", {
          original_length: originalTranscriptLength,
          max_length: MAX_TRANSCRIPT_LEN,
          dropped_chars: originalTranscriptLength - MAX_TRANSCRIPT_LEN,
        });
      }
    } else if (call.transcript != null && typeof call.transcript !== "string") {
      logger.warn("transcript_invalid_type", { actual_type: typeof call.transcript });
    }

    builder.footers();

    const bytes = await builder.doc.save();
    const filename = `call-summary-${safeDateShort(call.call_date)}.pdf`;
    logger.info("pdf_generated", {
      page_count: builder.doc.getPageCount(),
      byte_length: bytes.byteLength,
      filename,
      drop_counters: logger.counters(),
    });

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "x-request-id": requestId,
      },
    });
  } catch (e) {
    const err = e as Error;
    logger.error("unhandled_exception", {
      error_message: err.message,
      error_name: err.name,
      stack: err.stack,
    });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
    });
  }
});