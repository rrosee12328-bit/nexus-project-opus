import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";

type AiAnalysis = {
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

const PRIMARY: [number, number, number] = [37, 99, 235]; // Vektiss Blue
const TEXT: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];
const MARGIN = 50;

function safeDate(s: string) {
  try {
    return format(parseISO(s), "MMMM d, yyyy");
  } catch {
    return s;
  }
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
  doc.text(`Meeting Summary — ${safeDate(call.call_date)}`, MARGIN, y);
  y += 22;

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
    doc.text(line, MARGIN, y);
    y += 14;
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

  const ai = call.ai_analysis || {};

  const sectionHeading = (text: string) => {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...PRIMARY);
    doc.text(text, MARGIN, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
  };

  const paragraph = (text: string, size = 10) => {
    doc.setFontSize(size);
    doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(text, contentWidth);
    lines.forEach((line: string) => {
      ensureSpace(14);
      doc.text(line, MARGIN, y);
      y += 14;
    });
  };

  const bulletList = (items: string[]) => {
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    items.forEach((item) => {
      const lines = doc.splitTextToSize(item, contentWidth - 14);
      lines.forEach((line: string, idx: number) => {
        ensureSpace(14);
        if (idx === 0) {
          doc.setTextColor(...PRIMARY);
          doc.text("•", MARGIN, y);
          doc.setTextColor(...TEXT);
        }
        doc.text(line, MARGIN + 14, y);
        y += 14;
      });
      y += 2;
    });
  };

  // Executive Overview
  const execSummary = ai.executive_summary || call.summary;
  if (execSummary) {
    sectionHeading("Executive Overview");
    paragraph(execSummary);
    y += 8;
  }

  // Sentiment badge
  const sentiment = ai.sentiment || call.sentiment;
  if (sentiment) {
    ensureSpace(24);
    const label = `Sentiment: ${sentiment}`;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const w = doc.getTextWidth(label) + 16;
    const colorMap: Record<string, [number, number, number]> = {
      positive: [16, 185, 129],
      neutral: [107, 114, 128],
      "at-risk": [239, 68, 68],
      negative: [239, 68, 68],
      mixed: [245, 158, 11],
    };
    const c = colorMap[sentiment.toLowerCase()] || MUTED;
    doc.setFillColor(...c);
    doc.roundedRect(MARGIN, y - 10, w, 18, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(label, MARGIN + 8, y + 2);
    y += 22;
    doc.setFont("helvetica", "normal");
  }

  // Key Takeaways
  if (ai.key_takeaways?.length) {
    sectionHeading("Key Takeaways");
    bulletList(ai.key_takeaways);
    y += 6;
  }

  // Topics Discussed
  if (ai.topics_discussed?.length) {
    sectionHeading("Topics Discussed");
    ai.topics_discussed.forEach((t) => {
      ensureSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...TEXT);
      doc.text(t.topic || "Topic", MARGIN, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      if (t.summary) paragraph(t.summary);
      y += 4;
    });
  }

  // Client Commitments (only for client_facing)
  if (call.call_type === "client_facing" && ai.client_commitments?.length) {
    sectionHeading("Client Commitments");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Action", "Deadline", "Notes"]],
      body: ai.client_commitments.map((c) => [c.action || "—", c.deadline || "—", c.notes || "—"]),
      headStyles: { fillColor: PRIMARY, textColor: 255, fontSize: 10 },
      bodyStyles: { fontSize: 9, textColor: TEXT },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      styles: { cellPadding: 6, lineColor: BORDER, lineWidth: 0.5 },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  // Vektiss Tasks
  if (ai.vektiss_tasks?.length) {
    sectionHeading("Vektiss Tasks");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Task", "Assignee", "Priority", "Deadline", "Description"]],
      body: ai.vektiss_tasks.map((t) => [
        t.title || "—",
        t.assignee || "—",
        t.priority || "—",
        t.deadline || "—",
        t.description || "—",
      ]),
      headStyles: { fillColor: PRIMARY, textColor: 255, fontSize: 10 },
      bodyStyles: { fontSize: 9, textColor: TEXT },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      styles: { cellPadding: 6, lineColor: BORDER, lineWidth: 0.5 },
      columnStyles: {
        0: { cellWidth: 110 },
        1: { cellWidth: 70 },
        2: { cellWidth: 55 },
        3: { cellWidth: 70 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  // Key Decisions
  const decisions: string[] = ai.key_decisions?.length
    ? ai.key_decisions
    : Array.isArray(call.key_decisions)
    ? call.key_decisions
    : [];
  if (decisions.length) {
    sectionHeading("Key Decisions");
    bulletList(decisions);
    y += 6;
  }

  // Next Steps
  if (ai.next_steps) {
    sectionHeading("Next Steps");
    paragraph(ai.next_steps);
    y += 6;
  }

  // Transcript on a new page
  if (call.transcript) {
    doc.addPage();
    y = MARGIN;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...PRIMARY);
    doc.text("Full Transcript", MARGIN, y);
    y += 18;
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

  // Footer page numbers
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