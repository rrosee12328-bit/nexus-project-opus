import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { User, Lock, Bell, Save, Shield, Clock, RefreshCw, Send, Rocket } from "lucide-react";
import { OnboardingTemplatesManager } from "@/components/admin/OnboardingTemplatesManager";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { motion } from "framer-motion";
import { format } from "date-fns";

export default function AdminSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: reminderLogs, isLoading: remindersLoading } = useQuery({
    queryKey: ["reminder-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminder_log")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(50);
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
        .update({ display_name: displayName.trim() || null, avatar_url: avatarUrl.trim() || null })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profile", user?.id] });
      toast.success("Profile updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!newPassword || !confirmPassword) throw new Error("Please fill in all password fields");
      if (newPassword.length < 6) throw new Error("New password must be at least 6 characters");
      if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: currentPassword,
      });
      if (signInError) throw new Error("Current password is incorrect");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const triggerReminders = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-reminders");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reminder-log"] });
      toast.success(`Reminders processed: ${data?.reminders_enqueued ?? 0} enqueued`);
    },
    onError: (err: Error) => toast.error("Failed to trigger reminders: " + err.message),
  });

  const initials = (displayName || user?.email || "A")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const typeLabels: Record<string, string> = {
    unread_message: "Unread Messages",
    task_review: "Task Review",
    project_review: "Project Review",
    unpaid_invoice: "Unpaid Invoice",
    task_deadline: "Task Deadline",
  };

  const typeBadgeVariant = (type: string) => {
    switch (type) {
      case "task_deadline": return "destructive" as const;
      case "unpaid_invoice": return "destructive" as const;
      case "task_review": return "secondary" as const;
      default: return "outline" as const;
    }
  };

  const anim = (delay: number) => ({
    initial: { opacity: 0, y: 20 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { duration: 0.4, delay },
  });

  return (
    <div className="space-y-6">
      <motion.div {...anim(0)}>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account, security, and preferences.</p>
      </motion.div>

      <Tabs defaultValue="profile" className="space-y-6">
        <motion.div {...anim(0.1)}>
          <TabsList>
            <TabsTrigger value="profile" className="gap-2"><User className="h-4 w-4" /> Profile</TabsTrigger>
            <TabsTrigger value="security" className="gap-2"><Shield className="h-4 w-4" /> Security</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2"><Bell className="h-4 w-4" /> Notifications</TabsTrigger>
            <TabsTrigger value="reminders" className="gap-2"><Clock className="h-4 w-4" /> Reminders</TabsTrigger>
            <TabsTrigger value="onboarding" className="gap-2"><Rocket className="h-4 w-4" /> Onboarding</TabsTrigger>
          </TabsList>
        </motion.div>

        <TabsContent value="profile">
          <motion.div {...anim(0.15)}>
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" /> Profile Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-border">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{displayName || "No name set"}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Display Name</Label>
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <Label>Avatar URL</Label>
                    <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." maxLength={500} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Email</Label>
                  <Input value={user?.email ?? ""} disabled className="opacity-60" />
                  <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending || isLoading} className="gap-2">
                    <Save className="h-4 w-4" />
                    {updateProfile.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="security">
          <motion.div {...anim(0.15)}>
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" /> Change Password
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Current Password</Label>
                    <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
                  </div>
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 6 characters" />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm New Password</Label>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => changePassword.mutate()}
                    disabled={changePassword.isPending || !currentPassword || !newPassword || !confirmPassword}
                    variant="outline"
                    className="gap-2"
                  >
                    <Lock className="h-4 w-4" />
                    {changePassword.isPending ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="notifications">
          <motion.div {...anim(0.15)}>
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" /> Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "New client messages", desc: "Get notified when a client sends a message" },
                  { label: "Task assignments", desc: "Get notified when tasks are assigned or updated" },
                  { label: "Payment received", desc: "Get notified when a client payment is recorded" },
                  { label: "Project milestones", desc: "Get notified when a project phase is completed" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-2">Notification delivery is coming soon — preferences are saved locally.</p>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="reminders">
          <motion.div {...anim(0.15)} className="space-y-6">
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" /> Automated Reminders
                </CardTitle>
                <Button
                  onClick={() => triggerReminders.mutate()}
                  disabled={triggerReminders.isPending}
                  size="sm"
                  className="gap-2"
                >
                  {triggerReminders.isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {triggerReminders.isPending ? "Sending..." : "Send Now"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Reminders run automatically every day at 9:00 AM UTC. They check for unread messages, tasks awaiting review, tasks due within 24 hours, projects needing feedback, and unpaid invoices. Each reminder is only sent once per 24-hour window.
                </p>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-3">Recent Reminder Log</h3>
                  {remindersLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : !reminderLogs?.length ? (
                    <p className="text-sm text-muted-foreground">No reminders have been sent yet. Click "Send Now" to trigger a check.</p>
                  ) : (
                    <div className="rounded-md border overflow-auto max-h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Recipient</TableHead>
                            <TableHead>Sent At</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reminderLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell>
                                <Badge variant={typeBadgeVariant(log.reminder_type)}>
                                  {typeLabels[log.reminder_type] ?? log.reminder_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{log.recipient_email}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(log.sent_at), "MMM d, yyyy h:mm a")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="onboarding">
          <motion.div {...anim(0.15)}>
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" /> Client Onboarding
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OnboardingTemplatesManager />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
