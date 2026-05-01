import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

// ───────────────────────── Types ─────────────────────────

export type ParagraphBlock = { type: "paragraph"; text: string };
export type BulletItem = { label?: string; text: string };
export type BulletsBlock = { type: "bullets"; items: BulletItem[] };
export type TableBlock = {
  type: "table";
  columns: string[];
  rows: (string | number | null)[][];
};
export type CalloutBlock = {
  type: "callout";
  label?: string;
  text: string;
  tone?: "info" | "success" | "warning" | "danger";
};
export type Block = ParagraphBlock | BulletsBlock | TableBlock | CalloutBlock;

export type Section = {
  number?: number | string;
  title: string;
  blocks: Block[];
};

export type AiAnalysis = {
  // New rich format
  executive_overview?: string;
  sections?: Section[];

  // Legacy fixed-bucket fallback
  executive_summary?: string;
  sentiment?: string;
  key_takeaways?: string[];
  client_commitments?: Array<{ action?: string; deadline?: string; notes?: string }>;
  vektiss_tasks?: Array<{ title?: string; assignee?: string; priority?: string; deadline?: string; description?: string }>;
  key_decisions?: string[];
  topics_discussed?: Array<{ topic?: string; summary?: string }>;
  next_steps?: string;
};

export type CallForPdf = {
  call_date: string;
  duration_minutes?: number | null;
  call_type?: string | null;
  fathom_url?: string | null;
  fathom_meeting_id?: string | null;
  transcript?: string | null;
  summary?: string | null;
  sentiment?: string | null;
  key_decisions?: any;
  ai_analysis?: AiAnalysis | null;
  client_name?: string | null;
  project_name?: string | null;
};

// ───────────────────────── Theme ─────────────────────────

const PRIMARY: [number, number, number] = [37, 99, 235]; // Vektiss Blue
const TEXT: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];
const SURFACE: [number, number, number] = [249, 250, 251];

const TONES: Record<string, { bg: [number, number, number]; bar: [number, number, number]; text: [number, number, number] }> = {
  info:    { bg: [239, 246, 255], bar: [37, 99, 235],   text: [30, 58, 138] },
  success: { bg: [236, 253, 245], bar: [16, 185, 129],  text: [6, 95, 70] },
  warning: { bg: [255, 251, 235], bar: [245, 158, 11],  text: [120, 53, 15] },
  danger:  { bg: [254, 242, 242], bar: [239, 68, 68],   text: [127, 29, 29] },
};

const MARGIN = 50;

// ───────────────────────── Helpers ─────────────────────────

function safeDate(s: string) {
  try { return format(parseISO(s), "MMMM d, yyyy"); } catch { return s; }
}

function extractParticipants(transcript?: string | null): string {
  if (!transcript) return "—";
  const re = /\]\s*([^:]+?):/g;
  const set = new Set<string>();
  let m;
  while ((m = re.exec(transcript)) !== null) {
    const name = m[1].trim();
    if (name.length > 0 && name.length < 60) set.add(name);
  }
  return set.size ? Array.from(set).join(", ") : "—";
}

/**
 * Backwards-compat: convert the old fixed-bucket ai_analysis shape into Sections.
 */
function legacyToSections(ai: AiAnalysis, call: CallForPdf): Section[] {
  const sections: Section[] = [];
  let n = 1;

  if (ai.key_takeaways?.length) {
    sections.push({
      number: n++, title: "Key Takeaways",
      blocks: [{ type: "bullets", items: ai.key_takeaways.map((t) => ({ text: t })) }],
    });
  }

  if (ai.topics_discussed?.length) {
    const blocks: Block[] = [];
    ai.topics_discussed.forEach((t) => {
      if (t.topic) blocks.push({ type: "paragraph", text: t.topic });
      if (t.summary) blocks.push({ type: "paragraph", text: t.summary });
    });
    sections.push({ number: n++, title: "Topics Discussed", blocks });
  }

  if (call.call_type === "client_facing" && ai.client_commitments?.length) {
    sections.push({
      number: n++, title: "Client Commitments",
      blocks: [{
        type: "table",
        columns: ["Action", "Deadline", "Notes"],
        rows: ai.client_commitments.map((c) => [c.action || "—", c.deadline || "—", c.notes || "—"]),
      }],
    });
  }

  if (ai.vektiss_tasks?.length) {
    sections.push({
      number: n++, title: "Vektiss Tasks",
      blocks: [{
        type: "table",
        columns: ["Task", "Assignee", "Priority", "Deadline", "Description"],
        rows: ai.vektiss_tasks.map((t) => [
          t.title || "—", t.assignee || "—", t.priority || "—", t.deadline || "—", t.description || "—",
        ]),
      }],
    });
  }

  const decisions: string[] = ai.key_decisions?.length
    ? ai.key_decisions
    : Array.isArray(call.key_decisions) ? call.key_decisions : [];
  if (decisions.length) {
    sections.push({
      number: n++, title: "Key Decisions",
      blocks: [{ type: "bullets", items: decisions.map((d) => ({ text: d })) }],
    });
  }

  if (ai.next_steps) {
    sections.push({
      number: n++, title: "Next Steps",
      blocks: [{ type: "paragraph", text: ai.next_steps }],
    });
  }

  return sections;
}

// ───────────────────────── Generator ─────────────────────────

export function generateCallSummaryPdf(call: CallForPdf) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Header bar
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageWidth, 6, "F");

  // Brand
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PRIMARY);
  doc.text("VEKTISS", MARGIN, y);
  y += 24;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...TEXT);
  const titleLines = doc.splitTextToSize(`Meeting Summary — ${safeDate(call.call_date)}`, contentWidth);
  titleLines.forEach((line: string) => { doc.text(line, MARGIN, y); y += 24; });

  // Meta block
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const meta: string[] = [];
  if (call.duration_minutes) meta.push(`Duration: ${call.duration_minutes} minutes`);
  if (call.client_name) meta.push(`Client: ${call.client_name}`);
  if (call.project_name) meta.push(`Project: ${call.project_name}`);
  meta.push(`Participants: ${extractParticipants(call.transcript)}`);
  meta.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, contentWidth);
    wrapped.forEach((l: string) => { ensureSpace(14); doc.text(l, MARGIN, y); y += 14; });
  });

  // Recording link
  if (call.fathom_url || call.fathom_meeting_id) {
    const url = call.fathom_url || `https://fathom.video/calls/${call.fathom_meeting_id}`;
    doc.setTextColor(...PRIMARY);
    doc.textWithLink("▶ View Recording in Fathom", MARGIN, y, { url });
    y += 18;
  }

  y += 4;
  doc.setDrawColor(...BORDER);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 18;

  // ───── Block renderers ─────

  const renderParagraph = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(text, contentWidth);
    lines.forEach((line: string) => {
      ensureSpace(15);
      doc.text(line, MARGIN, y);
      y += 15;
    });
    y += 4;
  };

  const renderBullets = (items: BulletItem[]) => {
    doc.setFontSize(10.5);
    items.forEach((item) => {
      const labelText = item.label ? `${item.label}: ` : "";
      const fullText = `${labelText}${item.text}`;
      const lines = doc.splitTextToSize(fullText, contentWidth - 16);
      lines.forEach((line: string, idx: number) => {
        ensureSpace(15);
        if (idx === 0) {
          doc.setTextColor(...PRIMARY);
          doc.setFont("helvetica", "bold");
          doc.text("•", MARGIN + 2, y);
        }
        // Render label in bold inline if first line and label exists
        if (idx === 0 && item.label) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...TEXT);
          const labelW = doc.getTextWidth(`${item.label}: `);
          doc.text(`${item.label}:`, MARGIN + 16, y);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...TEXT);
          // Draw remainder of first line after label
          const remainder = line.slice(`${item.label}: `.length);
          doc.text(remainder, MARGIN + 16 + labelW, y);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...TEXT);
          doc.text(line, MARGIN + 16, y);
        }
        y += 15;
      });
      y += 3;
    });
    y += 3;
  };

  const renderTable = (block: TableBlock) => {
    ensureSpace(40);
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [block.columns],
      body: block.rows.map((r) => r.map((c) => (c == null ? "—" : String(c)))),
      headStyles: { fillColor: PRIMARY, textColor: 255, fontSize: 10, fontStyle: "bold" },
      bodyStyles: { fontSize: 9.5, textColor: TEXT, valign: "top" },
      alternateRowStyles: { fillColor: SURFACE },
      styles: { cellPadding: 7, lineColor: BORDER, lineWidth: 0.5, overflow: "linebreak" },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  };

  const renderCallout = (block: CalloutBlock) => {
    const tone = TONES[block.tone || "info"];
    const padding = 12;
    const innerWidth = contentWidth - padding * 2 - 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const labelLines = block.label ? [block.label] : [];
    const bodyLines = doc.splitTextToSize(block.text, innerWidth);
    const lineHeight = 14;
    const boxHeight = padding * 2 + (labelLines.length ? labelLines.length * lineHeight + 4 : 0) + bodyLines.length * lineHeight;
    ensureSpace(boxHeight + 6);
    // Background
    doc.setFillColor(...tone.bg);
    doc.roundedRect(MARGIN, y, contentWidth, boxHeight, 4, 4, "F");
    // Left bar
    doc.setFillColor(...tone.bar);
    doc.rect(MARGIN, y, 4, boxHeight, "F");
    let cy = y + padding + 11;
    if (block.label) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...tone.bar);
      doc.text(block.label, MARGIN + padding + 4, cy);
      cy += lineHeight + 2;
    }
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...tone.text);
    bodyLines.forEach((line: string) => {
      doc.text(line, MARGIN + padding + 4, cy);
      cy += lineHeight;
    });
    y += boxHeight + 10;
  };

  const renderBlock = (block: Block) => {
    switch (block.type) {
      case "paragraph": return renderParagraph(block.text);
      case "bullets":   return renderBullets(block.items || []);
      case "table":     return renderTable(block);
      case "callout":   return renderCallout(block);
    }
  };

  const renderSectionHeading = (title: string, number?: number | string) => {
    ensureSpace(36);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...PRIMARY);
    const prefix = number != null ? `${number}. ` : "";
    doc.text(`${prefix}${title}`, MARGIN, y);
    y += 8;
    // Underline accent
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(1.5);
    doc.line(MARGIN, y, MARGIN + 32, y);
    doc.setLineWidth(0.5);
    y += 14;
  };

  // ───── Executive Overview ─────
  const ai = call.ai_analysis || {};
  const execOverview = ai.executive_overview || ai.executive_summary || call.summary;
  if (execOverview) {
    renderSectionHeading("Executive Overview");
    renderParagraph(execOverview);
  }

  // Sentiment badge
  const sentiment = ai.sentiment || call.sentiment;
  if (sentiment) {
    ensureSpace(28);
    const label = `Sentiment: ${sentiment}`;
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    const w = doc.getTextWidth(label) + 18;
    const colorMap: Record<string, [number, number, number]> = {
      positive: [16, 185, 129],
      neutral: [107, 114, 128],
      "at-risk": [239, 68, 68],
      negative: [239, 68, 68],
      mixed: [245, 158, 11],
    };
    const c = colorMap[sentiment.toLowerCase()] || MUTED;
    doc.setFillColor(...c);
    doc.roundedRect(MARGIN, y - 11, w, 20, 4, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(label, MARGIN + 9, y + 3);
    y += 26;
    doc.setFont("helvetica", "normal");
  }

  // ───── Sections (rich format) or legacy fallback ─────
  const sections: Section[] = ai.sections?.length
    ? ai.sections.map((s, i) => ({ number: s.number ?? i + 1, title: s.title, blocks: s.blocks || [] }))
    : legacyToSections(ai, call);

  sections.forEach((section) => {
    renderSectionHeading(section.title, section.number);
    section.blocks.forEach(renderBlock);
    y += 6;
  });

  // ───── Transcript on a new page ─────
  if (call.transcript) {
    doc.addPage();
    y = MARGIN;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...PRIMARY);
    doc.text("Full Transcript", MARGIN, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(call.transcript, contentWidth);
    lines.forEach((line: string) => {
      ensureSpace(12);
      doc.text(line, MARGIN, y);
      y += 12;
    });
  }

  // ───── Footer page numbers ─────
  const total = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Vektiss · Meeting Summary`, MARGIN, pageHeight - 20);
    doc.text(`Page ${i} of ${total}`, pageWidth - MARGIN, pageHeight - 20, { align: "right" });
  }

  const fname = `call-summary-${format(parseISO(call.call_date), "yyyy-MM-dd")}.pdf`;
  doc.save(fname);
}