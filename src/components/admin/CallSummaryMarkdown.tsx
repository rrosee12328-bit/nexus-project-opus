import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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