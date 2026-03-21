import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseTypingIndicatorOptions {
  channelName: string;
  userId: string | undefined;
  userName: string;
}

export function useTypingIndicator({ channelName, userId, userName }: UseTypingIndicatorOptions) {
  const [typingUsers, setTypingUsers] = useState<Map<string, { name: string; timestamp: number }>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    if (!userId || !channelName) return;

    const channel = supabase.channel(`typing-${channelName}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId === userId) return;
        setTypingUsers((prev) => {
          const next = new Map(prev);
          if (payload.isTyping) {
            next.set(payload.userId, { name: payload.userName, timestamp: Date.now() });
          } else {
            next.delete(payload.userId);
          }
          return next;
        });
      })
      .subscribe();

    channelRef.current = channel;

    // Cleanup stale typing indicators every 4 seconds
    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next = new Map(prev);
        let changed = false;
        for (const [key, val] of next) {
          if (now - val.timestamp > 5000) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 4000);

    return () => {
      clearInterval(interval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName, userId]);

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current || !userId) return;
      const now = Date.now();
      // Throttle: don't send more than once per 2 seconds for "typing" events
      if (isTyping && now - lastSentRef.current < 2000) return;
      lastSentRef.current = now;

      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId, userName, isTyping },
      });
    },
    [userId, userName],
  );

  const handleInputChange = useCallback(() => {
    sendTyping(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => sendTyping(false), 3000);
  }, [sendTyping]);

  const stopTyping = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    sendTyping(false);
  }, [sendTyping]);

  const typingNames = Array.from(typingUsers.values()).map((u) => u.name);

  return { typingNames, handleInputChange, stopTyping };
}
