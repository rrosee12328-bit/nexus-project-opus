import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

export default function AdminMessages() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["admin-msg-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, status")
        .in("status", ["active", "onboarding"])
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch latest message per client for preview
  const { data: latestMessages = [] } = useQuery({
    queryKey: ["admin-latest-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("client_id, content, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Deduplicate — keep first (latest) per client
      const seen = new Set<string>();
      return (data ?? []).filter((m) => {
        if (seen.has(m.client_id)) return false;
        seen.add(m.client_id);
        return true;
      });
    },
  });

  // Fetch messages for selected client
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

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("admin-messages-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-messages", selectedClientId] });
          queryClient.invalidateQueries({ queryKey: ["admin-latest-messages"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedClientId, queryClient]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedClientId || !user?.id) throw new Error("No client selected");
      const { error } = await supabase.from("messages").insert({
        client_id: selectedClientId,
        sender_id: user.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["admin-messages", selectedClientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-latest-messages"] });
    },
    onError: () => toast.error("Failed to send message"),
  });

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const getLatest = (clientId: string) => latestMessages.find((m) => m.client_id === clientId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="text-muted-foreground">Real-time conversations with your clients.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 h-[600px]">
        {/* Client list */}
        <Card className="overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Clients
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {clients.map((client) => {
                const latest = getLatest(client.id);
                const isSelected = client.id === selectedClientId;
                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className={`w-full text-left rounded-lg px-3 py-3 transition-colors ${
                      isSelected
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-accent/10 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{client.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{client.status}</Badge>
                    </div>
                    {latest && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{latest.content}</p>
                    )}
                  </button>
                );
              })}
              {clients.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No active clients</p>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Chat area */}
        <Card className="overflow-hidden flex flex-col">
          {!selectedClientId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Select a client</h3>
              <p className="text-sm text-muted-foreground mt-1">Choose a client from the list to start messaging.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 border-b border-border flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {selectedClient?.name?.slice(0, 2).toUpperCase() ?? "??"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm">{selectedClient?.name}</p>
                  <p className="text-xs text-muted-foreground">{messages.length} messages</p>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16">
                    <p className="text-sm text-muted-foreground">No messages yet. Send the first one!</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isAdmin = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
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
                            <p>{msg.content}</p>
                            <p className={`text-[10px] mt-1 ${isAdmin ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                              {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input */}
              <div className="border-t border-border p-4 bg-muted/20">
                <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                  <Input
                    placeholder="Type your message…"
                    className="flex-1 bg-background"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={sendMutation.isPending}
                  />
                  <Button type="submit" disabled={!message.trim() || sendMutation.isPending} className="shrink-0">
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
