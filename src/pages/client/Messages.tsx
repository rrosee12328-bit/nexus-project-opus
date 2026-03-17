import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ClientMessages() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="text-muted-foreground mt-1">Communicate directly with your Vektiss creative team.</p>
      </div>

      {/* Chat area */}
      <Card className="overflow-hidden">
        <div className="h-[500px] flex flex-col">
          {/* Message area */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Start a conversation</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Send a message to your Vektiss team. We typically respond within a few hours during business days.
            </p>
          </div>

          {/* Input area */}
          <div className="border-t border-border p-4 bg-muted/20">
            <div className="flex gap-2">
              <Input
                placeholder="Type your message…"
                className="flex-1 bg-background"
                disabled
              />
              <Button disabled className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Messaging is coming soon — your team will enable this feature shortly.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
