import { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, Send, Loader2, User, Sparkles, Zap, Copy, Check,
  RotateCcw, ChevronDown, ChevronUp, FileText, Shield,
  DollarSign, AlertTriangle, ListChecks, Clock, BarChart3,
  TrendingUp, MessageSquare, ClipboardList, GitCompare,
  Download,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  type AISuggestion,
  type AIPageContext,
  type AIRole,
  getAISuggestions,
  enrichPrompt,
} from "@/lib/aiContextConfig";

type Msg = { role: "user" | "assistant"; content: string };

const ICON_MAP: Record<string, React.ElementType> = {
  summary: FileText,
  health: Shield,
  finance: DollarSign,
  risk: AlertTriangle,
  task: ListChecks,
  timeline: Clock,
  report: BarChart3,
  upsell: TrendingUp,
  draft: MessageSquare,
  checklist: ClipboardList,
  bottleneck: AlertTriangle,
  compare: GitCompare,
};

const CATEGORY_COLORS: Record<string, string> = {
  analysis: "border-primary/20 hover:border-primary/40 hover:bg-primary/5",
  action: "border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/5",
  report: "border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/5",
  communication: "border-violet-500/20 hover:border-violet-500/40 hover:bg-violet-500/5",
};

/* ── Copyable code block ── */
function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const lang = className?.replace("language-", "") ?? "";
  const copy = () => {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group rounded-lg overflow-hidden my-2 border border-border/50">
      <div className="flex items-center justify-between bg-muted/60 px-3 py-1 text-[10px] text-muted-foreground font-mono">
        <span className="uppercase tracking-wider">{lang}</span>
        <button onClick={copy} className="flex items-center gap-1 hover:text-foreground transition-colors">
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="!mt-0 !rounded-t-none bg-[hsl(0_0%_7%)] p-3 overflow-x-auto text-xs leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

/* ── Response action buttons ── */
function ResponseActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  return (
    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
        onClick={handleDownload}
      >
        <Download className="h-3 w-3" />
        Export
      </Button>
    </div>
  );
}

interface AICommandCenterProps {
  pageContext: AIPageContext;
  /** Override role detection */
  role?: AIRole;
  /** Compact mode — inline bar instead of panel */
  variant?: "panel" | "bar";
}

export default function AICommandCenter({
  pageContext,
  role: roleProp,
  variant = "panel",
}: AICommandCenterProps) {
  const { user, role: authRole } = useAuth();
  const role = (roleProp ?? authRole ?? "client") as AIRole;
  const suggestions = useMemo(() => getAISuggestions(role, pageContext.pageType), [role, pageContext.pageType]);

  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Don't show if no suggestions for this page and not expanded
  if (suggestions.length === 0 && !expanded) return null;

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (text?: string) => {
    const msgText = text ?? input.trim();
    if (!msgText || isLoading || !user) return;

    const enriched = enrichPrompt(msgText, pageContext);
    const userMsg: Msg = { role: "user", content: enriched };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    if (!expanded) setExpanded(true);

    try {
      const resp = await supabase.functions.invoke("ai-agent", {
        body: { messages: newMessages.map((m) => ({ role: m.role, content: m.content })) },
      });
      if (resp.error) throw new Error(resp.error.message);
      const data = resp.data;
      if (data?.error) {
        if (data.error.includes("Rate limit")) toast.error("Rate limit exceeded. Please wait.");
        else if (data.error.includes("credits")) toast.error("AI credits exhausted.");
        else toast.error(data.error);
        return;
      }
      setMessages([
        ...newMessages,
        { role: "assistant", content: data.content || "I couldn't generate a response." },
      ]);
    } catch (err) {
      console.error("AI Command Center error:", err);
      toast.error("Failed to get a response.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    if (messages.length < 2 || isLoading) return;
    const trimmed = messages.slice(0, -1);
    setMessages(trimmed);
    setIsLoading(true);
    try {
      const resp = await supabase.functions.invoke("ai-agent", {
        body: { messages: trimmed.map((m) => ({ role: m.role, content: m.content })) },
      });
      if (resp.error) throw new Error(resp.error.message);
      setMessages([...trimmed, { role: "assistant", content: resp.data?.content || "Failed." }]);
    } catch {
      toast.error("Retry failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const clearChat = () => {
    setMessages([]);
    setExpanded(false);
  };

  const canRetry = messages.length >= 2 && messages[messages.length - 1]?.role === "assistant" && !isLoading;

  /* ── Markdown components ── */
  const mdComponents = useMemo(() => ({
    code({ className, children, ...props }: any) {
      const isBlock = className?.startsWith("language-");
      if (isBlock) return <CodeBlock className={className}>{String(children)}</CodeBlock>;
      return (
        <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      );
    },
    table({ children }: any) {
      return (
        <div className="overflow-x-auto my-2 rounded-lg border border-border/50">
          <table className="w-full text-xs">{children}</table>
        </div>
      );
    },
    th({ children }: any) {
      return <th className="bg-muted/50 px-2 py-1.5 text-left font-semibold text-foreground border-b border-border text-xs">{children}</th>;
    },
    td({ children }: any) {
      return <td className="px-2 py-1.5 border-b border-border/30 text-xs">{children}</td>;
    },
  }), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="border border-border/50 rounded-xl bg-card/80 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <h3 className="text-sm font-semibold text-foreground leading-tight">AI Command Center</h3>
          <p className="text-[11px] text-muted-foreground truncate">
            {pageContext.entityName
              ? `Analyzing ${pageContext.entityName}`
              : `${suggestions.length} smart actions available`}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Suggestion pills — always visible when not expanded */}
      {!expanded && suggestions.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 4).map((s) => {
            const Icon = ICON_MAP[s.icon ?? "summary"] ?? Sparkles;
            return (
              <button
                key={s.label}
                onClick={() => handleSend(s.prompt)}
                className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all duration-150 text-muted-foreground hover:text-foreground ${CATEGORY_COLORS[s.category ?? "analysis"]}`}
              >
                <Icon className="h-3 w-3 flex-shrink-0" />
                {s.label}
              </button>
            );
          })}
          {suggestions.length > 4 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
            >
              +{suggestions.length - 4} more
            </button>
          )}
        </div>
      )}

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30">
              {/* All suggestions */}
              {messages.length === 0 && suggestions.length > 0 && (
                <div className="px-4 py-3 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Smart Actions</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {suggestions.map((s) => {
                      const Icon = ICON_MAP[s.icon ?? "summary"] ?? Sparkles;
                      return (
                        <button
                          key={s.label}
                          onClick={() => handleSend(s.prompt)}
                          className={`flex items-center gap-2 text-left text-[11px] px-3 py-2 rounded-lg border transition-all duration-150 text-muted-foreground hover:text-foreground ${CATEGORY_COLORS[s.category ?? "analysis"]}`}
                        >
                          <Icon className="h-3.5 w-3.5 flex-shrink-0 text-primary/60" />
                          <span className="truncate">{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chat messages */}
              {messages.length > 0 && (
                <ScrollArea className="max-h-[400px]" ref={scrollRef}>
                  <div className="px-4 py-3 space-y-3">
                    {messages.map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {msg.role === "assistant" && (
                          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex-shrink-0 flex items-center justify-center mt-0.5 ring-1 ring-primary/10">
                            <Bot className="h-3 w-3 text-primary" />
                          </div>
                        )}
                        <div
                          className={`rounded-xl px-3 py-2 max-w-[90%] text-xs ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted/50 border border-border/30 text-card-foreground rounded-bl-sm"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <>
                              <div className="prose prose-xs dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-medium [&_blockquote]:border-l-primary/40 [&_a]:text-primary [&_a]:underline [&_strong]:text-foreground text-xs">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                                  {msg.content}
                                </ReactMarkdown>
                              </div>
                              <ResponseActions content={msg.content} />
                            </>
                          ) : (
                            <p className="whitespace-pre-wrap leading-relaxed">
                              {/* Show simplified version of enriched prompt */}
                              {msg.content.split("\n\nContext:")[0]}
                            </p>
                          )}
                        </div>
                        {msg.role === "user" && (
                          <div className="h-6 w-6 rounded-md bg-muted flex-shrink-0 flex items-center justify-center mt-0.5">
                            <User className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </motion.div>
                    ))}

                    {isLoading && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                        <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex-shrink-0 flex items-center justify-center mt-0.5 ring-1 ring-primary/10">
                          <Bot className="h-3 w-3 text-primary" />
                        </div>
                        <div className="bg-muted/50 border border-border/30 rounded-xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1">
                          <span className="flex gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:300ms]" />
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {canRetry && (
                      <div className="flex justify-center">
                        <button
                          onClick={handleRetry}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-full hover:bg-secondary"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Regenerate
                        </button>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}

              {/* Input + actions */}
              <div className="px-4 py-3 border-t border-border/30 space-y-2">
                <div className="flex gap-1.5 items-end bg-background/80 rounded-lg border border-border/50 p-1 focus-within:border-primary/30 transition-all">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything about this page..."
                    className="min-h-[32px] max-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 text-xs placeholder:text-muted-foreground/50"
                    rows={1}
                  />
                  <Button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-md bg-primary hover:bg-primary/90 disabled:opacity-30"
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  </Button>
                </div>

                {/* Quick suggestion chips when in chat */}
                {messages.length > 0 && suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {suggestions.slice(0, 3).map((s) => (
                      <button
                        key={s.label}
                        onClick={() => handleSend(s.prompt)}
                        disabled={isLoading}
                        className="text-[10px] px-2 py-1 rounded-md border border-border/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all disabled:opacity-50"
                      >
                        {s.label}
                      </button>
                    ))}
                    {messages.length > 0 && (
                      <button
                        onClick={clearChat}
                        className="text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-destructive transition-all ml-auto"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
