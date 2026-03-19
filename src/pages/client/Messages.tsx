import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ClientMessages() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Get the client_id for the current user
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

  // Fetch messages
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

  // Subscribe to realtime
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`messages-${clientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["client-messages", clientId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, queryClient]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!clientId || !user?.id) throw new Error("Not linked to a client");
      const { error } = await supabase.from("messages").insert({
        client_id: clientId,
        sender_id: user.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["client-messages", clientId] });
    },
    onError: () => toast.error("Failed to send message"),
  });

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  const isMyMessage = (senderId: string) => senderId === user?.id;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="text-muted-foreground mt-1">Communicate directly with your Vektiss creative team.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="h-[500px] flex flex-col">
          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center h-full text-center py-16">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Start a conversation</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Send a message to your Vektiss team. We typically respond within a few hours during business days.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const mine = isMyMessage(msg.sender_id);
                return (
                  <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
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
                        <p>{msg.content}</p>
                        <p className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input area */}
          <div className="border-t border-border p-4 bg-muted/20">
            {!clientId ? (
              <p className="text-xs text-muted-foreground text-center">
                Your account isn't linked to a client profile yet. Contact your admin.
              </p>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex gap-2"
              >
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
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
