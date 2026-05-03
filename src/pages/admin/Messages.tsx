import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { useAuth } from "@/hooks/useAuth";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Loader2, Users, CheckCheck, Check, Search } from "lucide-react";
import { PageHero } from "@/components/ui/page-shell";
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

export default function AdminMessages() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: clients = [] } = useQuery({
    queryKey: ["admin-msg-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, status, user_id")
        .in("status", ["active", "onboarding"])
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: latestMessages = [] } = useQuery({
    queryKey: ["admin-latest-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("client_id, content, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const seen = new Set<string>();
      return (data ?? []).filter((m) => {
        if (seen.has(m.client_id)) return false;
        seen.add(m.client_id);
        return true;
      });
    },
  });

  const { data: unreadCounts = {} } = useQuery({
    queryKey: ["admin-unread-counts"],
    queryFn: async () => {
      if (!user?.id) return {};
      const { data, error } = await supabase
        .from("messages")
        .select("client_id, id")
        .is("read_at", null)
        .neq("sender_id", user.id);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m) => {
        counts[m.client_id] = (counts[m.client_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user?.id,
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["admin-messages", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("client_id", selectedClientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClientId,
  });

  // Typing indicator
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const { typingNames, handleInputChange, stopTyping } = useTypingIndicator({
    channelName: selectedClientId ? `chat-${selectedClientId}` : "",
    userId: user?.id,
    userName: "Vektiss Team",
  });

  // Auto-mark client-sent messages as read
  useEffect(() => {
    if (!selectedClientId || !user?.id || messages.length === 0) return;
    const clientUserId = selectedClient?.user_id;
    if (!clientUserId) return;
    const unread = messages.filter((m) => m.sender_id === clientUserId && !m.read_at);
    if (unread.length === 0) return;
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", selectedClientId)
      .eq("sender_id", clientUserId)
      .is("read_at", null)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["admin-messages", selectedClientId] });
        queryClient.invalidateQueries({ queryKey: ["admin-unread-counts"] });
      });
  }, [selectedClientId, user?.id, messages, selectedClient, queryClient]);

  // Real-time: listen for INSERT and UPDATE (read receipts)
  useEffect(() => {
    const channel = supabase
      .channel("admin-messages-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-messages", selectedClientId] });
          queryClient.invalidateQueries({ queryKey: ["admin-latest-messages"] });
          queryClient.invalidateQueries({ queryKey: ["admin-unread-counts"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedClientId, queryClient]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async ({ content, attachment }: { content: string; attachment?: { url: string; name: string; type: string } | null }) => {
      if (!selectedClientId || !user?.id) throw new Error("No client selected");
      const { error } = await supabase.from("messages").insert({
        client_id: selectedClientId,
        sender_id: user.id,
        content,
        ...(attachment ? { attachment_url: attachment.url, attachment_name: attachment.name, attachment_type: attachment.type } : {}),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("");
      setPendingAttachment(null);
      stopTyping();
      queryClient.invalidateQueries({ queryKey: ["admin-messages", selectedClientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-latest-messages"] });
      const clientName = clients.find((c) => c.id === selectedClientId)?.name;
      logActivity("sent_message", "message", selectedClientId ?? null, `Sent message to ${clientName ?? "client"}`);
    },
    onError: () => toast.error("Failed to send message"),
  });

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed && !pendingAttachment) return;
    sendMutation.mutate({ content: trimmed || (pendingAttachment ? `📎 ${pendingAttachment.name}` : ""), attachment: pendingAttachment });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getLatest = (clientId: string) => latestMessages.find((m) => m.client_id === clientId);

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

  // Sort clients: unread first, then by latest message
  const sortedClients = [...clients]
    .filter((c) => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const ua = unreadCounts[a.id] || 0;
      const ub = unreadCounts[b.id] || 0;
      if (ua !== ub) return ub - ua;
      const la = getLatest(a.id)?.created_at ?? "";
      const lb = getLatest(b.id)?.created_at ?? "";
      return lb.localeCompare(la);
    });

  return (
    <div className="space-y-6">
      <PageHero
        kicker={<><MessageSquare className="h-3 w-3" />Vektiss / Messages</>}
        title="Messages"
        description="Real-time conversations with your clients."
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]"
      >
        {/* Client list */}
        <Card className="flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Clients
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search clients…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sortedClients.map((client) => {
                const latest = getLatest(client.id);
                const isSelected = client.id === selectedClientId;
                const unread = unreadCounts[client.id] || 0;
                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className={`w-full text-left rounded-lg px-3 py-3 transition-colors ${
                      isSelected ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-accent/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium text-sm truncate ${unread > 0 ? "font-bold" : ""}`}>{client.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {unread > 0 && (
                          <Badge className="text-[10px] h-5 min-w-[20px] flex items-center justify-center px-1.5">
                            {unread}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {latest && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{latest.content}</p>
                    )}
                    {latest && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {format(new Date(latest.created_at), "MMM d, h:mm a")}
                      </p>
                    )}
                  </button>
                );
              })}
              {sortedClients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Users className="h-6 w-6 text-primary/40" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {searchQuery ? "No clients match your search" : "No active clients"}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Chat area */}
        <Card className="overflow-hidden flex flex-col">
          {!selectedClientId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-primary/40" />
              </div>
              <h3 className="font-semibold text-lg">Select a client</h3>
              <p className="text-sm text-muted-foreground mt-1">Choose a client from the list to start messaging.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 border-b border-border flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {selectedClient?.name?.slice(0, 2).toUpperCase() ?? "??"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{selectedClient?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {typingNames.length > 0 ? (
                      <span className="text-primary animate-pulse">typing…</span>
                    ) : (
                      <span className="font-mono">{messages.length}</span>
                    )}
                    {typingNames.length === 0 && " messages"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">{selectedClient?.status}</Badge>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                {msgsLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16 gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-6 w-6 text-primary/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">No messages yet. Send the first one!</p>
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
                          const isAdmin = msg.sender_id === user?.id;
                          return (
                            <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"} mb-2`}>
                              <div className={`flex items-end gap-2 max-w-[75%] ${isAdmin ? "flex-row-reverse" : ""}`}>
                                <Avatar className="h-7 w-7 shrink-0">
                                  <AvatarFallback className={`text-xs font-semibold ${isAdmin ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"}`}>
                                    {isAdmin ? "You" : selectedClient?.name?.charAt(0) ?? "C"}
                                  </AvatarFallback>
                                </Avatar>
                                <div
                                  className={`rounded-2xl px-4 py-2.5 text-sm ${
                                    isAdmin
                                      ? "bg-primary text-primary-foreground rounded-br-md"
                                      : "bg-muted text-foreground rounded-bl-md"
                                  }`}
                                >
                                  <p className="whitespace-pre-wrap">{msg.content}</p>
                                  {(msg as any).attachment_url && (
                                    <MessageAttachment
                                      url={(msg as any).attachment_url}
                                      name={(msg as any).attachment_name || "File"}
                                      type={(msg as any).attachment_type}
                                      isOwn={isAdmin}
                                    />
                                  )}
                                  <div className={`flex items-center gap-1 mt-1 ${isAdmin ? "justify-end" : ""}`}>
                                    <p className={`text-[10px] ${isAdmin ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                      {format(new Date(msg.created_at), "h:mm a")}
                                    </p>
                                    {isAdmin && (
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
                    {/* Typing indicator from client */}
                    <TypingDots names={typingNames} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-border p-3 bg-muted/20 space-y-2">
                {pendingAttachment && (
                  <PendingAttachment name={pendingAttachment.name} onRemove={() => setPendingAttachment(null)} />
                )}
                <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2 items-end">
                  <FileUploadButton
                    clientId={selectedClientId!}
                    onFileUploaded={setPendingAttachment}
                    disabled={sendMutation.isPending || !!pendingAttachment}
                  />
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
                  <Button type="submit" size="icon" disabled={(!message.trim() && !pendingAttachment) || sendMutation.isPending} className="shrink-0 h-10 w-10">
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </div>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
