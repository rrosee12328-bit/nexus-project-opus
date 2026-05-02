import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, DollarSign, Target, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function BusinessRulesPanel() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["business-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [hourlyCost, setHourlyCost] = useState<string>("125");
  const [targetMargin, setTargetMargin] = useState<string>("50");
  const [lowMargin, setLowMargin] = useState<string>("20");

  useEffect(() => {
    if (settings) {
      setHourlyCost(String(settings.internal_hourly_cost ?? 125));
      setTargetMargin(String(settings.target_margin_pct ?? 50));
      setLowMargin(String(settings.low_margin_threshold_pct ?? 20));
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("Settings row not initialized");
      const { error } = await supabase
        .from("business_settings")
        .update({
          internal_hourly_cost: Number(hourlyCost),
          target_margin_pct: Number(targetMargin),
          low_margin_threshold_pct: Number(lowMargin),
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Business rules updated");
      qc.invalidateQueries({ queryKey: ["business-settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" /> Business Rules
        </CardTitle>
        <CardDescription>
          The numbers Vektiss AI uses to judge profitability. Update these and the AI immediately sees clients through this lens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2">
          <Label htmlFor="hourly-cost" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" /> Internal hourly cost
          </Label>
          <Input
            id="hourly-cost"
            type="number"
            min="0"
            step="5"
            value={hourlyCost}
            onChange={(e) => setHourlyCost(e.target.value)}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            What 1 hour of your team's time costs the business. Used to compute true labor cost per client (hours × this rate).
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="target-margin" className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" /> Target margin (%)
          </Label>
          <Input
            id="target-margin"
            type="number"
            min="0"
            max="100"
            step="1"
            value={targetMargin}
            onChange={(e) => setTargetMargin(e.target.value)}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">The healthy profit margin you aim for on every client.</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="low-margin" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> Low-margin alert threshold (%)
          </Label>
          <Input
            id="low-margin"
            type="number"
            min="0"
            max="100"
            step="1"
            value={lowMargin}
            onChange={(e) => setLowMargin(e.target.value)}
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            When a client's margin falls below this for the month, the AI flags them as at-risk.
          </p>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading} className="gap-2">
          <Save className="h-4 w-4" /> {save.isPending ? "Saving..." : "Save business rules"}
        </Button>
      </CardContent>
    </Card>
  );
}