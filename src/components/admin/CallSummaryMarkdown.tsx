import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Extracts a brief, plain-text statement describing the meeting's point.
 * Strips markdown formatting (headings, links, bold, etc.) and returns
 * the first meaningful sentence (or a short truncation).
 */
export function getBriefSummary(raw: string | null | undefined, maxLen = 140): string {
  if (!raw) return "";
  let text = raw;
  // Drop fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, " ");
  // Convert markdown links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Remove timestamps like "@ 0:13"
  text = text.replace(/@\s*\d{1,2}:\d{2}(?::\d{2})?/g, "");
  // Strip heading markers, list bullets, blockquote markers at line starts
  text = text.replace(/^[\s>]*#{1,6}\s+/gm, "");
  text = text.replace(/^[\s]*[-*+]\s+/gm, "");
  // Strip bold/italic/code markers
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/[*_`]+/g, "");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";
  // Prefer the first paragraph that looks like a real sentence (skip section headings)
  const sentenceMatch = text.match(/[^.!?]{10,}[.!?]/);
  let brief = sentenceMatch ? sentenceMatch[0] : text;
  brief = brief.trim();
  if (brief.length > maxLen) {
    brief = brief.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }
  return brief;
}

/**
 * Renders a Fathom-style markdown call summary (### headings, paragraphs, links,
 * lists, tables) with the same typography we use in the Summaries reader.
 */
export function CallSummaryMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-foreground mt-4 mb-2 tracking-tight">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold text-foreground mt-5 mb-2 pb-1.5 border-b border-border">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-foreground mt-4 mb-1.5">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-sm text-foreground/80 leading-relaxed mb-2.5">{children}</p>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="space-y-1 mb-3 ml-4 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="space-y-1 mb-3 ml-4 list-decimal">{children}</ol>,
          li: ({ children }) => (
            <li className="text-sm text-foreground/80 leading-relaxed pl-1">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="text-foreground font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          hr: () => <div className="my-4 border-t border-border/60" />,
          code: ({ children }) => (
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{children}</code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 italic text-foreground/70 my-3">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-3 rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          th: ({ children }) => (
            <th className="text-left text-xs font-semibold text-foreground px-3 py-2 border-b border-border">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="text-sm text-foreground/80 px-3 py-2 border-b border-border/40">{children}</td>
          ),
          tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}