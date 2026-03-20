import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ArrowRight, ListChecks } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STEP_ROUTES: Record<string, string> = {
  review_project: "/portal/projects",
  upload_assets: "/portal/assets",
  upload_logos: "/portal/assets",
  upload_brand_assets: "/portal/assets",
  send_message: "/portal/messages",
  review_payments: "/portal/payments",
};

interface OnboardingStep {
  id: string;
  step_key: string;
  title: string;
  description: string | null;
  completed_at: string | null;
  sort_order: number;
  category: string | null;
}

export function OnboardingChecklist() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: steps, isLoading } = useQuery({
    queryKey: ["onboarding-steps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_onboarding_steps")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as OnboardingStep[];
    },
  });

  const completeStep = useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await supabase
        .from("client_onboarding_steps")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps"] });
      toast.success("Step completed!");
    },
  });

  if (isLoading || !steps?.length) return null;

  const completedCount = steps.filter((s) => s.completed_at).length;
  const totalCount = steps.length;
  const allDone = completedCount === totalCount;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  if (allDone) return null;

  // Group steps by category (null category = ungrouped)
  const grouped: { category: string | null; items: OnboardingStep[] }[] = [];
  let currentCategory: string | null | undefined = undefined;

  for (const step of steps) {
    if (step.category !== currentCategory) {
      currentCategory = step.category;
      grouped.push({ category: step.category, items: [] });
    }
    grouped[grouped.length - 1].items.push(step);
  }

  const hasCategories = grouped.some((g) => g.category);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.03] to-card overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Getting Started
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              {completedCount}/{totalCount} complete
            </span>
          </CardTitle>
          <Progress value={progressPercent} className="h-1.5 mt-2" />
        </CardHeader>
        <CardContent className="space-y-1 pt-0">
          <AnimatePresence>
            {grouped.map((group, gi) => {
              const groupCompleted = group.items.filter((s) => s.completed_at).length;
              const groupTotal = group.items.length;

              return (
                <div key={gi} className={cn(hasCategories && gi > 0 && "mt-4")}>
                  {hasCategories && group.category && (
                    <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {groupCompleted}/{groupTotal}
                      </span>
                    </div>
                  )}
                  {group.items.map((step, i) => {
                    const isDone = !!step.completed_at;
                    const route = STEP_ROUTES[step.step_key];

                    return (
                      <motion.div
                        key={step.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: (gi * group.items.length + i) * 0.03 }}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                          isDone
                            ? "opacity-60"
                            : "hover:bg-primary/5 cursor-pointer"
                        )}
                        onClick={() => {
                          if (isDone) return;
                          if (route) {
                            completeStep.mutate(step.id);
                            navigate(route);
                          } else {
                            completeStep.mutate(step.id);
                          }
                        }}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium",
                            isDone && "line-through text-muted-foreground"
                          )}>
                            {step.title}
                          </p>
                          {step.description && !isDone && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {step.description}
                            </p>
                          )}
                        </div>
                        {!isDone && route && (
                          <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
