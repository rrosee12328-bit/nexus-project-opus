import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { User, Bell, Palette, Save, Mail, Shield } from "lucide-react";
import { motion } from "framer-motion";

export default function OpsSettings() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  // Notification preferences (local state — no DB table for these yet)
  const [notifTaskAssigned, setNotifTaskAssigned] = useState(true);
  const [notifTaskCompleted, setNotifTaskCompleted] = useState(true);
  const [notifNewMessage, setNotifNewMessage] = useState(true);
  const [notifSopUpdated, setNotifSopUpdated] = useState(false);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifInApp, setNotifInApp] = useState(true);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setAvatarUrl(profile.avatar_url ?? "");
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast({ title: "Profile updated" });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const initials = (displayName || user?.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const anim = (delay: number) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay },
  });

  return (
    <div className="space-y-6">
      <motion.div {...anim(0)}>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your profile, notifications, and preferences.</p>
      </motion.div>

      <motion.div {...anim(0.1)}>
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-primary/10">
              <User className="h-4 w-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-primary/10">
              <Bell className="h-4 w-4" /> Notifications
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2 data-[state=active]:bg-primary/10">
              <Palette className="h-4 w-4" /> Appearance
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <motion.div {...anim(0.15)}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" /> Profile Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar preview */}
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-border">
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{displayName || "No name set"}</p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Display Name</Label>
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Avatar URL</Label>
                      <Input
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder="https://..."
                        maxLength={500}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3 w-3" /> Email
                      </Label>
                      <Input value={user?.email ?? ""} disabled className="opacity-60" />
                      <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3 w-3" /> Role
                      </Label>
                      <Input value={role ?? ""} disabled className="opacity-60 capitalize" />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => updateProfile.mutate()}
                      disabled={updateProfile.isPending || isLoading}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {updateProfile.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <motion.div {...anim(0.15)}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" /> Notification Events
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: "Task assigned to me", desc: "Get notified when a task is assigned to you.", value: notifTaskAssigned, set: setNotifTaskAssigned },
                    { label: "Task completed", desc: "Get notified when a task you're watching is completed.", value: notifTaskCompleted, set: setNotifTaskCompleted },
                    { label: "New message", desc: "Get notified for new messages in client threads.", value: notifNewMessage, set: setNotifNewMessage },
                    { label: "SOP updated", desc: "Get notified when a standard operating procedure is changed.", value: notifSopUpdated, set: setNotifSopUpdated },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch checked={item.value} onCheckedChange={item.set} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div {...anim(0.2)}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" /> Delivery Channels
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: "Email notifications", desc: "Receive notifications via email.", value: notifEmail, set: setNotifEmail },
                    { label: "In-app notifications", desc: "Show notifications within the app.", value: notifInApp, set: setNotifInApp },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <Switch checked={item.value} onCheckedChange={item.set} />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Notification preferences are stored locally. Backend notification delivery coming soon.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-6">
            <motion.div {...anim(0.15)}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" /> Theme
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Choose your preferred visual theme for the ops portal.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: "dark", label: "Dark", colors: ["bg-[hsl(0,0%,5%)]", "bg-[hsl(0,0%,10%)]", "bg-[hsl(225,100%,61%)]"] },
                      { key: "light", label: "Light", colors: ["bg-[hsl(0,0%,98%)]", "bg-[hsl(0,0%,94%)]", "bg-[hsl(225,100%,61%)]"] },
                      { key: "system", label: "System", colors: ["bg-[hsl(0,0%,50%)]", "bg-[hsl(0,0%,30%)]", "bg-[hsl(225,100%,61%)]"] },
                    ].map((theme) => (
                      <button
                        key={theme.key}
                        className={`rounded-lg border-2 p-3 text-center transition-colors ${
                          theme.key === "dark"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/30"
                        }`}
                        onClick={() =>
                          toast({
                            title: `${theme.label} theme`,
                            description: "Theme switching coming soon. Currently using dark theme.",
                          })
                        }
                      >
                        <div className="flex justify-center gap-1.5 mb-2">
                          {theme.colors.map((c, i) => (
                            <div key={i} className={`h-4 w-4 rounded-full ${c} border border-border`} />
                          ))}
                        </div>
                        <span className="text-xs font-medium">{theme.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Theme switching is planned for a future update. The app currently uses the dark theme.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
