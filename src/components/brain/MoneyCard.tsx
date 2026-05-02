import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DollarSign } from "lucide-react";
import { CashStrip } from "./CashStrip";
import { ProfitabilityStrip } from "./ProfitabilityStrip";

/**
 * Combined "Money" card. Two tabs:
 *  - Cash: this-month inflow / MRR / outstanding / churn risk
 *  - Profitability: 30/90/YTD per-client winners + bleeders
 * Reuses the existing strip components untouched.
 */
export function MoneyCard() {
  const [tab, setTab] = useState<"cash" | "profit">("cash");
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            Money
          </CardTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "cash" | "profit")}>
            <TabsList className="h-8">
              <TabsTrigger value="cash" className="text-xs">Cash · this month</TabsTrigger>
              <TabsTrigger value="profit" className="text-xs">Profitability</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Render both so internal data fetches keep state on tab switch */}
        <div className={tab === "cash" ? "block" : "hidden"}>
          <CashStrip embedded />
        </div>
        <div className={tab === "profit" ? "block" : "hidden"}>
          <ProfitabilityStrip embedded />
        </div>
      </CardContent>
    </Card>
  );
}