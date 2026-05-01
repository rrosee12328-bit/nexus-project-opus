// Server-side Call Summary PDF generator
// Renders rich `ai_analysis.sections` (paragraph/bullets/table/callout)
// with legacy fallback. Returns a PDF binary stream.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";

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
    const linkAnnotation = this.doc.context.register(
      this.doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [MARGIN, this.y - 2, MARGIN + w, this.y + size + 2],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: url },
      }),
    );
    const annots = this.page.node.lookup(this.doc.context.obj("Annots") as any) as any;
    const existing = (this.page.node.Annots() as any) ?? this.doc.context.obj([]);
    existing.push(linkAnnotation);
    this.page.node.set(this.doc.context.obj("Annots") as any, existing);
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

  try {
    const url = new URL(req.url);
    let callId = url.searchParams.get("call_id");

    if (!callId && (req.method === "POST")) {
      try {
        const body = await req.json();
        callId = body?.call_id ?? null;
      } catch { /* ignore */ }
    }

    if (!callId) {
      return new Response(JSON.stringify({ error: "Missing call_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch call (RLS-scoped via user JWT)
    const { data: call, error: callErr } = await supabase
      .from("call_intelligence")
      .select("*")
      .eq("id", callId)
      .maybeSingle();

    if (callErr || !call) {
      return new Response(JSON.stringify({ error: callErr?.message || "Call not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const ai: AiAnalysis = call.ai_analysis || {};
    const execOverview = ai.executive_overview || ai.executive_summary || call.summary;
    if (execOverview) {
      builder.sectionHeading("Executive Overview");
      builder.paragraph(execOverview);
    }

    const sentiment = ai.sentiment || call.sentiment;
    if (sentiment) builder.sentimentBadge(sentiment);

    const fallbackDecisions = Array.isArray(call.key_decisions)
      ? call.key_decisions
      : call.key_decisions ? [String(call.key_decisions)] : [];

    const sections: Section[] = ai.sections?.length
      ? ai.sections.map((s, i) => ({ number: s.number ?? i + 1, title: s.title, blocks: s.blocks || [] }))
      : legacyToSections(ai, call.call_type, fallbackDecisions);

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

    if (call.transcript) {
      builder.newPage();
      builder.drawText("Full Transcript", MARGIN, { font: builder.fontBold, size: 14, color: PRIMARY });
      builder.y -= 22;
      const transcriptLines = wrapText(builder.font, call.transcript, 9, CONTENT_W);
      for (const line of transcriptLines) {
        builder.ensure(12);
        builder.drawText(line, MARGIN, { font: builder.font, size: 9, color: TEXT });
        builder.y -= 12;
      }
    }

    builder.footers();

    const bytes = await builder.doc.save();
    const filename = `call-summary-${safeDateShort(call.call_date)}.pdf`;

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("generate-call-summary-pdf error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});