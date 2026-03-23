import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { User, Lock, Bell, Save, Shield, Clock, RefreshCw, Send, Rocket, Eye, EyeOff, CheckCircle2, Mail, Users, UserPlus } from "lucide-react";
import { OnboardingTemplatesManager } from "@/components/admin/OnboardingTemplatesManager";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { motion } from "framer-motion";
import { format } from "date-fns";

export default function AdminSettings() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "ops">("admin");

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

  const { data: teamMembers, isLoading: teamLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at")
        .in("role", ["admin", "ops"]);
      if (error) throw error;
      // Fetch profiles for these users
      const userIds = (data ?? []).map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);
      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      return (data ?? []).map((r) => ({
        ...r,
        display_name: profileMap.get(r.user_id)?.display_name ?? null,
      }));
    },
  });

  const inviteTeamMember = useMutation({
    mutationFn: async () => {
      if (!inviteEmail.trim()) throw new Error("Email is required");
      const { data, error } = await supabase.functions.invoke("invite-admin", {
        body: { email: inviteEmail.trim(), display_name: inviteName.trim() || undefined, role: inviteRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteName("");
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
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

  const passwordStrength = (() => {
    if (!newPassword) return null;
    let score = 0;
    if (newPassword.length >= 6) score++;
    if (newPassword.length >= 10) score++;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score++;
    if (/\d/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;
    if (score <= 2) return { label: "Weak", color: "bg-destructive" };
    if (score <= 3) return { label: "Fair", color: "bg-warning" };
    return { label: "Strong", color: "bg-emerald-500" };
  })();

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
    <div className="space-y-8 max-w-3xl">
      <motion.div {...anim(0)}>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, security, and preferences.</p>
      </motion.div>

      <Tabs defaultValue="profile" className="space-y-6">
        <motion.div {...anim(0.1)}>
          <TabsList className="w-full overflow-x-auto flex-nowrap justify-start">
            <TabsTrigger value="profile" className="gap-2 shrink-0"><User className="h-4 w-4" /> <span className="hidden sm:inline">Profile</span></TabsTrigger>
            <TabsTrigger value="security" className="gap-2 shrink-0"><Shield className="h-4 w-4" /> <span className="hidden sm:inline">Security</span></TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2 shrink-0"><Bell className="h-4 w-4" /> <span className="hidden sm:inline">Notifications</span></TabsTrigger>
            <TabsTrigger value="reminders" className="gap-2 shrink-0"><Clock className="h-4 w-4" /> <span className="hidden sm:inline">Reminders</span></TabsTrigger>
            <TabsTrigger value="team" className="gap-2 shrink-0"><Users className="h-4 w-4" /> <span className="hidden sm:inline">Team</span></TabsTrigger>
            <TabsTrigger value="onboarding" className="gap-2 shrink-0"><Rocket className="h-4 w-4" /> <span className="hidden sm:inline">Onboarding</span></TabsTrigger>
          </TabsList>
        </motion.div>

        {/* ── Profile Tab ── */}
        <TabsContent value="profile">
          <motion.div {...anim(0.15)}>
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" /> Profile Information
                </CardTitle>
                <CardDescription>Your personal details visible across the admin portal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <AvatarUpload
                    userId={user!.id}
                    currentUrl={avatarUrl || null}
                    initials={initials}
                    onUploaded={(url) => {
                      setAvatarUrl(url ?? "");
                      queryClient.invalidateQueries({ queryKey: ["admin-profile", user?.id] });
                    }}
                  />
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">{displayName || "No name set"}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                    <Badge variant="outline" className="capitalize text-xs mt-1">
                      <Shield className="h-3 w-3 mr-1" />
                      {role ?? "admin"}
                    </Badge>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3 w-3" /> Email Address
                  </Label>
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

        {/* ── Security Tab ── */}
        <TabsContent value="security">
          <motion.div {...anim(0.15)} className="space-y-6">
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" /> Change Password
                </CardTitle>
                <CardDescription>Verify your current password before setting a new one.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Current Password</Label>
                    <div className="relative">
                      <Input type={showCurrentPw ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
                      <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>New Password</Label>
                      <div className="relative">
                        <Input type={showNewPw ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 6 characters" className="pr-10" />
                        <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {passwordStrength && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${passwordStrength.color}`} style={{ width: passwordStrength.label === "Weak" ? "33%" : passwordStrength.label === "Fair" ? "66%" : "100%" }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{passwordStrength.label}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm New Password</Label>
                      <div className="relative">
                        <Input type={showConfirmPw ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
                        <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {confirmPassword && newPassword && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {confirmPassword === newPassword ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="text-xs text-emerald-500">Passwords match</span>
                            </>
                          ) : (
                            <span className="text-xs text-destructive">Passwords do not match</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
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

            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" /> Account Security
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Active Session</p>
                    <p className="text-xs text-muted-foreground">You're currently logged in as {user?.email}</p>
                  </div>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Notifications Tab ── */}
        <TabsContent value="notifications">
          <motion.div {...anim(0.15)}>
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" /> Notification Preferences
                </CardTitle>
                <CardDescription>Choose how and when you'd like to be notified.</CardDescription>
              </CardHeader>
              <CardContent>
                <NotificationPreferences />
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Reminders Tab ── */}
        <TabsContent value="reminders">
          <motion.div {...anim(0.15)} className="space-y-6">
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" /> Automated Reminders
                  </CardTitle>
                  <CardDescription className="mt-1">Reminders run daily at 9 AM UTC for unread messages, tasks, and invoices.</CardDescription>
                </div>
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
                <div>
                  <h3 className="text-sm font-semibold mb-3">Recent Reminder Log</h3>
                  {remindersLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : !reminderLogs?.length ? (
                    <p className="text-sm text-muted-foreground">No reminders sent yet. Click "Send Now" to trigger a check.</p>
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

        {/* ── Team Tab ── */}
        <TabsContent value="team">
          <motion.div {...anim(0.15)} className="space-y-6">
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" /> Invite Team Member
                </CardTitle>
                <CardDescription>Send an invite link so someone can join as an admin or ops team member.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="team@vektiss.com" type="email" />
                  </div>
                  <div className="space-y-2">
                    <Label>Display Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Full name" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant={inviteRole === "admin" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setInviteRole("admin")}
                      className="gap-2"
                    >
                      <Shield className="h-3.5 w-3.5" /> Admin
                    </Button>
                    <Button
                      type="button"
                      variant={inviteRole === "ops" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setInviteRole("ops")}
                      className="gap-2"
                    >
                      <Clock className="h-3.5 w-3.5" /> Ops
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {inviteRole === "admin"
                      ? "Full access to clients, projects, finances, and settings."
                      : "Access to tasks, timesheets, SOPs, and project execution."}
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => inviteTeamMember.mutate()}
                    disabled={inviteTeamMember.isPending || !inviteEmail.trim()}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {inviteTeamMember.isPending ? "Sending..." : "Send Invite"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" /> Team Members
                </CardTitle>
                <CardDescription>Admin and ops users with portal access.</CardDescription>
              </CardHeader>
              <CardContent>
                {teamLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : !teamMembers?.length ? (
                  <p className="text-sm text-muted-foreground">No team members found.</p>
                ) : (
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamMembers.map((member) => (
                          <TableRow key={member.user_id}>
                            <TableCell className="text-sm font-medium">
                              {member.display_name || "—"}
                              {member.user_id === user?.id && (
                                <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={member.role === "admin" ? "default" : "secondary"} className="capitalize text-xs">
                                {member.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(member.created_at), "MMM d, yyyy")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ── Onboarding Tab ── */}
        <TabsContent value="onboarding">
          <motion.div {...anim(0.15)}>
            <Card className="hover:border-primary/20 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" /> Client Onboarding Templates
                </CardTitle>
                <CardDescription>Manage default onboarding steps for new clients.</CardDescription>
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
