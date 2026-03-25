import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Bot, Send, Loader2, User, Sparkles, Plus, MessageSquare,
  Trash2, Mic, MicOff, Search, PanelLeftClose, PanelLeft, Copy, Check,
  RotateCcw, Zap, Paperclip, X, FileText, ImageIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type MsgAttachment = { name: string; type: string; dataUrl: string };
type Msg = { role: "user" | "assistant"; content: string; attachments?: MsgAttachment[] };
type Conversation = { id: string; title: string; updated_at: string };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const TEXT_EXTENSIONS = ["txt", "md", "csv", "json", "xml", "html", "css", "js", "ts", "tsx", "jsx", "py", "sql", "yaml", "yml", "toml", "log", "sh"];

function getFileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isTextFile(file: File) {
  return file.type.startsWith("text/") || TEXT_EXTENSIONS.includes(getFileExtension(file.name));
}

function isImageFile(file: File) {
  return IMAGE_TYPES.includes(file.type);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

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
    <div className="relative group rounded-lg overflow-hidden my-3 border border-border/50">
      <div className="flex items-center justify-between bg-muted/60 px-3 py-1.5 text-[10px] text-muted-foreground font-mono">
        <span className="uppercase tracking-wider">{lang}</span>
        <button onClick={copy} className="flex items-center gap-1 hover:text-foreground transition-colors">
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="!mt-0 !rounded-t-none bg-[hsl(0_0%_7%)] p-3.5 overflow-x-auto text-xs leading-relaxed">
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
      if (window.innerWidth < 768) setSidebarOpen(false);
    }
  }, []);

  const generateTitle = useCallback(async (msgs: Msg[]): Promise<string> => {
    const userMsgs = msgs.filter((m) => m.role === "user").map((m) => m.content);
    if (userMsgs.length === 0) return "New conversation";
    // Use first user message + assistant reply to create a short summary
    const context = msgs.slice(0, 4).map((m) => `${m.role}: ${m.content.slice(0, 120)}`).join("\n");
    try {
      const resp = await supabase.functions.invoke("ai-agent", {
        body: {
          messages: [
            { role: "user", content: `Summarize this conversation in 4-6 words as a short title. Only return the title, nothing else.\n\n${context}` },
          ],
        },
      });
      const title = resp.data?.content?.trim().replace(/^["']|["']$/g, "");
      if (title && title.length > 0 && title.length < 80) return title;
    } catch { /* fallback */ }
    return userMsgs[0].slice(0, 50);
  }, []);

  const saveMessages = useCallback((convoId: string, msgs: Msg[], generateNewTitle = false) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      let title: string;
      if (generateNewTitle && msgs.length >= 2) {
        title = await generateTitle(msgs);
      } else {
        title = msgs.find((m) => m.role === "user")?.content.slice(0, 60) || "New conversation";
      }
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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null;
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior });
    });
  }, []);

  /* ── Auto-scroll ── */
  useEffect(() => {
    const behavior: ScrollBehavior = messages.length > 1 || isLoading ? "smooth" : "auto";
    scrollToBottom(behavior);
    const timeoutId = window.setTimeout(() => scrollToBottom("auto"), 180);
    return () => window.clearTimeout(timeoutId);
  }, [activeConvoId, isLoading, messages.length, scrollToBottom]);

  useEffect(() => {
    const handleViewportChange = () => scrollToBottom("auto");
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    return () => window.visualViewport?.removeEventListener("resize", handleViewportChange);
  }, [scrollToBottom]);

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
        if (data.error.includes("Rate limit")) toast.error("Rate limit exceeded. Please wait.");
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
      saveMessages(convoId, finalMessages, finalMessages.length === 2);
    } catch (err) {
      console.error("Agent error:", err);
      toast.error("Failed to get a response. Please try again.");
      saveMessages(convoId, newMessages);
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Retry last ── */
  const handleRetry = async () => {
    if (messages.length < 2 || isLoading) return;
    const trimmed = messages.slice(0, -1); // remove last assistant msg
    setMessages(trimmed);
    setInput("");
    setIsLoading(true);

    const convoId = activeConvoId;
    if (!convoId) return;

    try {
      const resp = await supabase.functions.invoke("ai-agent", {
        body: { messages: trimmed.map((m) => ({ role: m.role, content: m.content })) },
      });
      if (resp.error) throw new Error(resp.error.message);
      const data = resp.data;
      if (data?.error) { toast.error(data.error); return; }
      const finalMessages: Msg[] = [
        ...trimmed,
        { role: "assistant", content: data.content || "I couldn't generate a response." },
      ];
      setMessages(finalMessages);
      saveMessages(convoId, finalMessages);
    } catch {
      toast.error("Retry failed. Please try again.");
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
        const levels: number[] = [];
        const step = Math.floor(dataArray.length / 24);
        for (let i = 0; i < 24; i++) levels.push(dataArray[i * step] / 255);
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
    if (!SpeechRecognition) { toast.error("Speech recognition not supported."); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    let finalTranscript = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        // Auto-stop after 2.5s of silence
        recognition.stop();
      }, 2500);
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript + " ";
        else interim = transcript;
      }
      setInput(finalTranscript + interim);
      resetSilenceTimer();
    };
    recognition.onerror = (event: any) => {
      console.error("Speech error:", event.error);
      if (silenceTimer) clearTimeout(silenceTimer);
      if (event.error !== "aborted") toast.error("Microphone error: " + event.error);
      stopAudioVisualizer();
      setIsListening(false);
    };
    recognition.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      stopAudioVisualizer();
      setIsListening(false);
    };
    recognition.start();
    startAudioVisualizer();
    setIsListening(true);
    resetSilenceTimer();
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
        <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      );
    },
    table({ children }: any) {
      return (
        <div className="overflow-x-auto my-3 rounded-lg border border-border/50">
          <table className="w-full text-xs">{children}</table>
        </div>
      );
    },
    th({ children }: any) {
      return <th className="bg-muted/50 px-3 py-2 text-left font-semibold text-foreground border-b border-border">{children}</th>;
    },
    td({ children }: any) {
      return <td className="px-3 py-2 border-b border-border/30">{children}</td>;
    },
  }), []);

  const canRetry = messages.length >= 2 && messages[messages.length - 1]?.role === "assistant" && !isLoading;

  /* ── Render ── */
  return (
    <div className="relative mx-auto flex h-[calc(100dvh-theme(spacing.12)-theme(spacing.12))] max-w-6xl min-h-0 gap-0 md:h-[calc(100vh-theme(spacing.12)-theme(spacing.12))] md:gap-0">
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
        } absolute md:relative z-10 md:z-auto inset-y-0 left-0 w-72 min-h-0 flex-shrink-0 flex flex-col bg-card md:bg-card/50 border-r border-border/50 transition-transform duration-200`}
      >
        {/* Sidebar header */}
        <div className="p-3 space-y-2 border-b border-border/50">
          <Button
            onClick={startNewConversation}
            className="w-full gap-2 bg-primary/10 hover:bg-primary/20 text-primary border-0 font-medium"
            variant="outline"
          >
            <Plus className="h-4 w-4" /> New Conversation
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-8 h-8 text-xs bg-background/50 border-border/50 focus-visible:ring-primary/30"
            />
          </div>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {loadingConvos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {searchQuery ? "No matching conversations" : "Start a new conversation"}
                </p>
              </div>
            ) : (
              filteredConversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadConversation(c.id)}
                  className={`group flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-sm transition-all duration-150 ${
                    activeConvoId === c.id
                      ? "bg-primary/10 text-primary shadow-sm shadow-primary/5"
                      : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                  <span className="truncate flex-1 text-[12px] leading-tight">{c.title}</span>
                  <Trash2
                    className="h-3.5 w-3.5 opacity-0 group-hover:opacity-70 hover:!opacity-100 text-destructive transition-opacity flex-shrink-0"
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
      <div className="flex-1 min-w-0 min-h-0 flex flex-col pl-10 md:pl-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground leading-tight">{title}</h1>
            <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
          </div>
          {messages.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {messages.length} messages
            </span>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0 touch-pan-y overscroll-contain" ref={scrollRef}>
          <div className="max-w-3xl mx-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-16 gap-5">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, type: "spring" }}
                  className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/10"
                >
                  <Sparkles className="h-9 w-9 text-primary" />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <h2 className="text-xl font-semibold text-foreground mb-1.5">How can I help?</h2>
                  <p className="text-sm text-muted-foreground max-w-sm">{subtitle}</p>
                </motion.div>
                {suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 w-full max-w-lg"
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                        className="text-left text-xs px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-secondary hover:border-primary/20 text-muted-foreground hover:text-foreground transition-all duration-150 group"
                      >
                        <span className="flex items-start gap-2">
                          <Sparkles className="h-3 w-3 mt-0.5 text-primary/40 group-hover:text-primary transition-colors flex-shrink-0" />
                          {s}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            )}

            <AnimatePresence>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`flex gap-3 mb-5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex-shrink-0 flex items-center justify-center mt-1 ring-1 ring-primary/10">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[88%] md:max-w-[78%] text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card border border-border/40 text-card-foreground rounded-bl-md"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-medium [&_blockquote]:border-l-primary/40 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_hr]:border-border [&_strong]:text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center mt-1">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Loading indicator */}
            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 mb-5">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex-shrink-0 flex items-center justify-center mt-1 ring-1 ring-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-card border border-border/40 rounded-2xl rounded-bl-md px-4 py-3.5 flex items-center gap-1.5">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/50 animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </motion.div>
            )}

            {/* Retry button */}
            {canRetry && (
              <div className="flex justify-center -mt-2 mb-2">
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full hover:bg-secondary"
                >
                  <RotateCcw className="h-3 w-3" />
                  Regenerate
                </button>
              </div>
            )}
            <div ref={messagesEndRef} className="h-px w-full" />
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="border-t border-border/30 p-3 bg-card/30 backdrop-blur-sm">
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
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 items-end bg-background/80 rounded-xl border border-border/50 p-1.5 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/10 transition-all">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => scrollToBottom("smooth")}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                className="min-h-[40px] max-h-32 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 text-sm placeholder:text-muted-foreground/50"
                rows={1}
              />
              <div className="flex gap-1 pb-0.5">
                <Button
                  onClick={toggleVoice}
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 shrink-0 rounded-lg ${
                    isListening
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/20 animate-pulse"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={isListening ? "Stop listening" : "Voice input"}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-30"
                >
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
              AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
