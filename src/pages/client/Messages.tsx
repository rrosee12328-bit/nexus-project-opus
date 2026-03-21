import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Send, Loader2, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format, isToday, isYesterday } from "date-fns";
import { MessageAttachment } from "@/components/messages/MessageAttachment";
import { FileUploadButton, PendingAttachment } from "@/components/messages/FileUploadButton";

function TypingDots({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const label = names.length === 1
    ? `${names[0]} is typing`
    : `${names.join(", ")} are typing`;
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

export default function ClientMessages() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: clientId } = useQuery({
    queryKey: ["my-client-id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.rpc("get_client_id_for_user", { _user_id: user.id });
      if (error) throw error;
      return data as string | null;
    },
    enabled: !!user?.id,
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["client-messages", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Typing indicator
  const { typingNames, handleInputChange, stopTyping } = useTypingIndicator({
    channelName: clientId ? `chat-${clientId}` : "",
    userId: user?.id,
    userName: profile?.display_name || "Client",
  });

  // Real-time: listen for all events including read receipt updates
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`messages-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        () => queryClient.invalidateQueries({ queryKey: ["client-messages", clientId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, queryClient]);

  // Mark incoming messages as read
  useEffect(() => {
    if (!clientId || !user?.id || messages.length === 0) return;
    const unread = messages.filter((m) => m.sender_id !== user.id && !m.read_at);
    if (unread.length === 0) return;
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .neq("sender_id", user.id)
      .is("read_at", null)
      .then(() => queryClient.invalidateQueries({ queryKey: ["client-messages", clientId] }));
  }, [clientId, user?.id, messages, queryClient]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!clientId || !user?.id) throw new Error("Not linked to a client");
      const { error } = await supabase.from("messages").insert({
        client_id: clientId, sender_id: user.id, content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("");
      stopTyping();
      queryClient.invalidateQueries({ queryKey: ["client-messages", clientId] });
    },
    onError: () => toast.error("Failed to send message"),
  });

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isMyMessage = (senderId: string) => senderId === user?.id;

  // Group messages by date
  const groupedMessages: { date: string; msgs: typeof messages }[] = [];
  messages.forEach((msg) => {
    const dateKey = new Date(msg.created_at).toDateString();
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.date === dateKey) {
      last.msgs.push(msg);
    } else {
      groupedMessages.push({ date: dateKey, msgs: [msg] });
    }
  });

  return (
    <div className="space-y-6">
      <motion.div {...{ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45 } }}>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="text-muted-foreground mt-1">Communicate directly with your Vektiss creative team.</p>
      </motion.div>

      <motion.div {...{ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: 0.1 } }}>
        <Card className="overflow-hidden border-border">
          <div className="h-[calc(100vh-280px)] min-h-[400px] max-h-[700px] flex flex-col">
            {/* Messages area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                    <MessageSquare className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="font-semibold text-xl">Start a conversation</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-sm leading-relaxed">
                    Send a message to your Vektiss team. We typically respond within a few hours during business days.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-6 justify-center">
                    {["Hi! I have a question about my project", "Can we schedule a call?", "I'd like to request a revision"].map((q) => (
                      <button
                        key={q}
                        onClick={() => setMessage(q)}
                        className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {groupedMessages.map((group) => (
                    <div key={group.date}>
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          {formatDateSeparator(group.date)}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      {group.msgs.map((msg) => {
                        const mine = isMyMessage(msg.sender_id);
                        return (
                          <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"} mb-2`}>
                            <div className={`flex items-end gap-2 max-w-[75%] ${mine ? "flex-row-reverse" : ""}`}>
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className={`text-xs font-semibold ${mine ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"}`}>
                                  {mine ? "You" : "V"}
                                </AvatarFallback>
                              </Avatar>
                              <div
                                className={`rounded-2xl px-4 py-2.5 text-sm ${
                                  mine
                                    ? "bg-primary text-primary-foreground rounded-br-md"
                                    : "bg-muted text-foreground rounded-bl-md"
                                }`}
                              >
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                <div className={`flex items-center gap-1 mt-1 ${mine ? "justify-end" : ""}`}>
                                  <p className={`text-[10px] ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                    {format(new Date(msg.created_at), "h:mm a")}
                                  </p>
                                  {mine && (
                                    msg.read_at
                                      ? <CheckCheck className="h-3 w-3 text-primary-foreground/60" />
                                      : <Check className="h-3 w-3 text-primary-foreground/40" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {/* Typing indicator from admin */}
                  <TypingDots names={typingNames} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-border p-3 bg-muted/20">
              {!clientId ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Your account isn't linked to a client profile yet. Contact your admin.
                </p>
              ) : (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="flex gap-2 items-end"
                >
                  <Textarea
                    placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
                    className="flex-1 bg-background min-h-[44px] max-h-[120px] resize-none text-sm"
                    rows={1}
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      handleInputChange();
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={sendMutation.isPending}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!message.trim() || sendMutation.isPending}
                    className="shrink-0 h-10 w-10"
                  >
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
