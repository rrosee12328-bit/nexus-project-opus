import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Bot, Send, Loader2, User, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

export default function AgentPage() {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const resp = await supabase.functions.invoke("ai-agent", {
        body: { messages: newMessages.map((m) => ({ role: m.role, content: m.content })) },
      });

      if (resp.error) {
        throw new Error(resp.error.message || "Failed to get response");
      }

      const data = resp.data;
      if (data?.error) {
        if (data.error.includes("Rate limit")) {
          toast.error("Rate limit exceeded. Please wait a moment and try again.");
        } else if (data.error.includes("credits")) {
          toast.error("AI credits exhausted. Please add funds in Settings > Workspace > Usage.");
        } else {
          toast.error(data.error);
        }
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.content || "I couldn't generate a response." }]);
    } catch (err) {
      console.error("Agent error:", err);
      toast.error("Failed to get a response. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.12)-theme(spacing.12))] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">AI Agent</h1>
          <p className="text-xs text-muted-foreground">Ask questions, take actions, get insights</p>
        </div>
      </div>

      {/* Messages */}
      <Card className="flex-1 flex flex-col overflow-hidden border-border bg-card">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20 gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">How can I help?</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  I can query client data, update financials, create tasks, send messages, and analyze your agency's performance.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 max-w-lg justify-center">
                {[
                  "Give me an overdue summary",
                  "How are we doing financially this year?",
                  "What's the status on all active projects?",
                  "Which clients have unpaid balances?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-secondary text-secondary-foreground hover:bg-surface-hover transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3 mb-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 rounded-md bg-primary/10 flex-shrink-0 flex items-center justify-center mt-1">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-lg px-4 py-3 max-w-[85%] text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none [&_table]:text-xs [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1 [&_table]:border-border [&_th]:border-border [&_td]:border-border">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="h-7 w-7 rounded-md bg-muted flex-shrink-0 flex items-center justify-center mt-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 mb-4">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex-shrink-0 flex items-center justify-center mt-1">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-secondary rounded-lg px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </motion.div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border p-3">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything or give an instruction..."
              className="min-h-[44px] max-h-32 resize-none bg-background border-border"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-[44px] w-[44px] shrink-0"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
