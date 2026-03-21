import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AvatarUpload } from "@/components/AvatarUpload";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  FolderKanban,
  Upload,
  MessageSquare,
  FileCheck,
  Rocket,
  PartyPopper,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const WIZARD_STEPS = [
  { id: "welcome", title: "Welcome to Vektiss" },
  { id: "profile", title: "Set Up Your Profile" },
  { id: "explore", title: "Explore Your Portal" },
  { id: "complete", title: "You're All Set!" },
] as const;



interface OnboardingWizardProps {
  onComplete: () => void;
  displayName: string;
}

export function OnboardingWizard({ onComplete, displayName }: OnboardingWizardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState(displayName || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["wizard-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      if (data?.display_name) setName(data.display_name);
      return data;
    },
    enabled: !!user?.id,
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const updates: Record<string, string> = {};
      if (name.trim()) updates.display_name = name.trim();
      if (avatarUrl) updates.avatar_url = avatarUrl;
      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-profile"] });
    },
  });

  const stepId = WIZARD_STEPS[currentStep].id;

  const goNext = async () => {
    if (stepId === "profile") {
      await updateProfile.mutateAsync();
    }
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const handleComplete = () => {
    localStorage.setItem(`wizard_completed_${user?.id}`, "true");
    toast.success("Welcome aboard! 🎉");
    onComplete();
  };

  const handleExploreNavigate = (path: string) => {
    localStorage.setItem(`wizard_completed_${user?.id}`, "true");
    onComplete();
    navigate(path);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full max-w-lg"
      >
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {WIZARD_STEPS.map((step, i) => (
            <div
              key={step.id}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? "w-8 bg-primary"
                  : i < currentStep
                  ? "w-2 bg-primary/60"
                  : "w-2 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        <Card className="overflow-hidden border-primary/10 shadow-2xl shadow-primary/5">
          <AnimatePresence mode="wait">
            <motion.div
              key={stepId}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
              className="p-8"
            >
              {/* Step 1: Welcome */}
              {stepId === "welcome" && (
                <div className="text-center space-y-6">
                  <div className="relative mx-auto w-20 h-20">
                    <div className="absolute inset-0 rounded-2xl bg-primary/10 animate-pulse" />
                    <div className="relative h-full w-full rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <Sparkles className="h-10 w-10 text-primary" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">
                      Welcome to Vektiss{name ? `, ${name}` : ""}!
                    </h2>
                    <p className="text-muted-foreground mt-3 leading-relaxed">
                      We're excited to have you on board. Let's take a quick tour of your creative portal
                      — it'll only take a minute.
                    </p>
                  </div>
                  <div className="flex justify-center gap-3 pt-2">
                    <Button onClick={goNext} className="gap-2 px-6">
                      Let's Go <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleComplete}>
                      Skip tour
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Profile setup */}
              {stepId === "profile" && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-xl font-bold tracking-tight">Set Up Your Profile</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Let us know what to call you.
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-5">
                    <AvatarUpload
                      currentUrl={avatarUrl}
                      onUpload={(url) => setAvatarUrl(url)}
                      userId={user?.id || ""}
                    />
                    <div className="w-full max-w-xs space-y-2">
                      <label className="text-sm font-medium">Display Name</label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="text-center"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="ghost" onClick={goBack} className="gap-1">
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button onClick={goNext} className="gap-2" disabled={updateProfile.isPending}>
                      {updateProfile.isPending ? "Saving…" : "Continue"} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Explore portal */}
              {stepId === "explore" && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-xl font-bold tracking-tight">Explore Your Portal</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Here's what you can do from your dashboard.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { icon: FolderKanban, label: "Projects", desc: "Track your project progress in real time", path: "/portal/projects" },
                      { icon: Upload, label: "Assets", desc: "Upload files and access deliverables", path: "/portal/assets" },
                      { icon: MessageSquare, label: "Messages", desc: "Chat directly with your creative team", path: "/portal/messages" },
                      { icon: FileCheck, label: "Approvals", desc: "Review and approve deliverables", path: "/portal/approvals" },
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={() => handleExploreNavigate(item.path)}
                        className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center hover:border-primary/30 hover:bg-primary/5 transition-all group"
                      >
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 group-hover:scale-105 transition-all">
                          <item.icon className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">{item.desc}</p>
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="ghost" onClick={goBack} className="gap-1">
                      <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button onClick={goNext} className="gap-2">
                      Almost Done <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Complete */}
              {stepId === "complete" && (
                <div className="text-center space-y-6">
                  <div className="relative mx-auto w-20 h-20">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 15, delay: 0.1 }}
                      className="h-full w-full rounded-2xl bg-gradient-to-br from-success/20 to-success/5 flex items-center justify-center"
                    >
                      <PartyPopper className="h-10 w-10 text-success" />
                    </motion.div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">You're All Set!</h2>
                    <p className="text-muted-foreground mt-3 leading-relaxed">
                      Your portal is ready. You'll find your project progress, deliverables, and messages
                      all in one place. We'll notify you of any updates.
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-3 pt-2">
                    <Button onClick={handleComplete} size="lg" className="gap-2 px-8">
                      <Rocket className="h-4 w-4" /> Go to Dashboard
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground gap-1"
                      onClick={() => handleExploreNavigate("/portal/messages")}
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Send your first message
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>
      </motion.div>
    </motion.div>
  );
}
