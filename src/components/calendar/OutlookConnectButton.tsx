import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Mail, RefreshCw, Plug } from "lucide-react";
import { toast } from "sonner";

export default function OutlookConnectButton() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshStatus = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) { setConnected(false); return; }
    const { data } = await supabase
      .from("ms_outlook_tokens" as any)
      .select("ms_email")
      .eq("user_id", u.user.id)
      .maybeSingle();
    setConnected(!!data);
    setEmail((data as any)?.ms_email ?? null);
  };

  useEffect(() => {
    refreshStatus();
    const url = new URL(window.location.href);
    if (url.searchParams.get("ms_connected") === "1") {
      toast.success("Outlook connected");
      url.searchParams.delete("ms_connected");
      window.history.replaceState({}, "", url.toString());
      refreshStatus();
    }
    const err = url.searchParams.get("ms_error");
    if (err) {
      toast.error("Outlook: " + err);
      url.searchParams.delete("ms_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const connect = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ms-oauth-start", {
        body: { return_to: "/admin/calendar" },
      });
      if (error) throw error;
      if ((data as any)?.url) window.location.href = (data as any).url;
    } catch (e: any) {
      toast.error(e.message || "Failed to start OAuth");
    } finally { setLoading(false); }
  };

  const sync = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ms-sync-my-calendar");
      if (error) throw error;
      const d = data as any;
      toast.success(`Synced ${d.upserted} event${d.upserted === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally { setLoading(false); }
  };

  if (connected === null) return null;

  if (!connected) {
    return (
      <Button variant="outline" size="sm" onClick={connect} disabled={loading}>
        <Plug className="h-4 w-4 mr-1" /> Connect Outlook
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={sync} disabled={loading} title={email || ""}>
      {loading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
      Sync Outlook
    </Button>
  );
}