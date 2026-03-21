import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Bot, Send, Loader2, User, Sparkles, Plus, MessageSquare,
  Trash2, Mic, MicOff, Search, PanelLeftClose, PanelLeft, Copy, Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string; updated_at: string };

interface AIAgentChatProps {
  title?: string;
  subtitle?: string;
  suggestions?: string[];
}

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
    <div className="relative group rounded-md overflow-hidden my-2">
      <div className="flex items-center justify-between bg-muted/80 px-3 py-1 text-[10px] text-muted-foreground font-mono">
        <span>{lang}</span>
        <button onClick={copy} className="flex items-center gap-1 hover:text-foreground transition-colors">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="!mt-0 !rounded-t-none bg-muted/40 p-3 overflow-x-auto text-xs">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export default function AIAgentChat({
  title = "AI Agent",
  subtitle = "Ask questions, take actions, get insights",
  suggestions = [],
}: AIAgentChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(24).fill(0));
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Conversation CRUD ── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("ai_conversations")
        .select("id, title, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      setConversations((data as Conversation[]) ?? []);
      setLoadingConvos(false);
    })();
  }, [user]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const loadConversation = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("ai_conversations")
      .select("messages")
      .eq("id", id)
      .single();
    if (data) {
      setMessages((data.messages as unknown as Msg[]) ?? []);
      setActiveConvoId(id);
      // auto-close sidebar on mobile
      if (window.innerWidth < 768) setSidebarOpen(false);
    }
  }, []);

  const saveMessages = useCallback((convoId: string, msgs: Msg[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const title = msgs.find((m) => m.role === "user")?.content.slice(0, 80) || "New conversation";
      await supabase
        .from("ai_conversations")
        .update({ messages: JSON.parse(JSON.stringify(msgs)), title })
        .eq("id", convoId);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convoId ? { ...c, title, updated_at: new Date().toISOString() } : c
        )
      );
    }, 500);
  }, []);

  const startNewConversation = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ai_conversations")
      .insert({ user_id: user.id, messages: [] })
      .select("id, title, updated_at")
      .single();
    if (data) {
      const convo = data as Conversation;
      setConversations((prev) => [convo, ...prev]);
      setActiveConvoId(convo.id);
      setMessages([]);
    }
  }, [user]);

  const deleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await supabase.from("ai_conversations").delete().eq("id", id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvoId === id) {
        setActiveConvoId(null);
        setMessages([]);
      }
    },
    [activeConvoId]
  );

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, isLoading]);

  /* ── Send message ── */
  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || !user) return;

    let convoId = activeConvoId;
    if (!convoId) {
      const { data } = await supabase
        .from("ai_conversations")
        .insert({ user_id: user.id, messages: [] })
        .select("id, title, updated_at")
        .single();
      if (!data) { toast.error("Failed to create conversation"); return; }
      const convo = data as Conversation;
      setConversations((prev) => [convo, ...prev]);
      setActiveConvoId(convo.id);
      convoId = convo.id;
    }

    const userMsg: Msg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const resp = await supabase.functions.invoke("ai-agent", {
        body: { messages: newMessages.map((m) => ({ role: m.role, content: m.content })) },
      });
      if (resp.error) throw new Error(resp.error.message || "Failed to get response");
      const data = resp.data;
      if (data?.error) {
        if (data.error.includes("Rate limit")) toast.error("Rate limit exceeded. Please wait a moment and try again.");
        else if (data.error.includes("credits")) toast.error("AI credits exhausted.");
        else toast.error(data.error);
        saveMessages(convoId, newMessages);
        return;
      }
      const finalMessages: Msg[] = [
        ...newMessages,
        { role: "assistant", content: data.content || "I couldn't generate a response." },
      ];
      setMessages(finalMessages);
      saveMessages(convoId, finalMessages);
    } catch (err) {
      console.error("Agent error:", err);
      toast.error("Failed to get a response. Please try again.");
      saveMessages(convoId, newMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  /* ── Voice ── */
  const startAudioVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevels = () => {
        analyser.getByteFrequencyData(dataArray);
        const bars = 24;
        const levels: number[] = [];
        const step = Math.floor(dataArray.length / bars);
        for (let i = 0; i < bars; i++) levels.push(dataArray[i * step] / 255);
        setAudioLevels(levels);
        animFrameRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();
    } catch { /* mic denied */ }
  }, []);

  const stopAudioVisualizer = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    setAudioLevels(new Array(24).fill(0));
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      stopAudioVisualizer();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error("Speech recognition is not supported in this browser."); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript + " ";
        else interim = transcript;
      }
      setInput(finalTranscript + interim);
    };
    recognition.onerror = (event: any) => {
      console.error("Speech error:", event.error);
      if (event.error !== "aborted") toast.error("Microphone error: " + event.error);
      stopAudioVisualizer();
      setIsListening(false);
    };
    recognition.onend = () => { stopAudioVisualizer(); setIsListening(false); };
    recognition.start();
    startAudioVisualizer();
    setIsListening(true);
  }, [isListening, startAudioVisualizer, stopAudioVisualizer]);

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); stopAudioVisualizer(); };
  }, []);

  /* ── Markdown components ── */
  const mdComponents = useMemo(() => ({
    code({ className, children, ...props }: any) {
      const isBlock = className?.startsWith("language-");
      if (isBlock) return <CodeBlock className={className}>{String(children)}</CodeBlock>;
      return (
        <code className="bg-muted/60 text-primary px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      );
    },
    table({ children }: any) {
      return (
        <div className="overflow-x-auto my-2 rounded-md border border-border">
          <table className="w-full text-xs">{children}</table>
        </div>
      );
    },
    th({ children }: any) {
      return <th className="bg-muted/50 px-3 py-2 text-left font-semibold border-b border-border">{children}</th>;
    },
    td({ children }: any) {
      return <td className="px-3 py-2 border-b border-border/50">{children}</td>;
    },
  }), []);

  /* ── Render ── */
  return (
    <div className="flex h-[calc(100vh-theme(spacing.12)-theme(spacing.12))] gap-0 md:gap-4 max-w-6xl mx-auto relative">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-0 left-0 z-20 md:hidden h-9 w-9"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </Button>

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } absolute md:relative z-10 md:z-auto inset-y-0 left-0 w-64 flex-shrink-0 flex flex-col gap-2 bg-background md:bg-transparent transition-transform duration-200`}
      >
        <Button onClick={startNewConversation} variant="outline" className="w-full gap-2">
          <Plus className="h-4 w-4" /> New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="pl-8 h-8 text-xs bg-background border-border"
          />
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 pr-2">
            {loadingConvos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                {searchQuery ? "No matching conversations" : "No conversations yet"}
              </p>
            ) : (
              filteredConversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadConversation(c.id)}
                  className={`group flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    activeConvoId === c.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate flex-1">{c.title}</span>
                  <Trash2
                    className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive transition-opacity flex-shrink-0"
                    onClick={(e) => deleteConversation(c.id, e)}
                  />
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Backdrop on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[9] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 pl-10 md:pl-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden border-border bg-card">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-20 gap-4">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground mb-1">How can I help?</h2>
                  <p className="text-sm text-muted-foreground max-w-md">{subtitle}</p>
                </div>
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 max-w-lg justify-center">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                        className="text-xs px-3 py-1.5 rounded-full border border-border bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
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
                    className={`rounded-lg px-4 py-3 max-w-[90%] md:max-w-[80%] text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-medium [&_blockquote]:border-l-primary/40 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_hr]:border-border">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                          {msg.content}
                        </ReactMarkdown>
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
                  <span className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span className="text-sm text-muted-foreground ml-1">Thinking...</span>
                </div>
              </motion.div>
            )}
          </ScrollArea>

          <div className="border-t border-border p-3">
            <AnimatePresence>
              {isListening && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 48, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-center gap-[3px] mb-3 overflow-hidden"
                >
                  {audioLevels.map((level, i) => (
                    <motion.div
                      key={i}
                      className="w-[3px] rounded-full bg-primary"
                      animate={{ height: Math.max(4, level * 40) }}
                      transition={{ duration: 0.05 }}
                    />
                  ))}
                  <span className="ml-3 text-xs text-destructive font-medium animate-pulse">Listening...</span>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                className="min-h-[44px] max-h-32 resize-none bg-background border-border"
                rows={1}
              />
              <Button
                onClick={toggleVoice}
                variant={isListening ? "destructive" : "outline"}
                size="icon"
                className={`h-[44px] w-[44px] shrink-0 ${isListening ? "animate-pulse" : ""}`}
                title={isListening ? "Stop listening" : "Voice input"}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
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
    </div>
  );
}
