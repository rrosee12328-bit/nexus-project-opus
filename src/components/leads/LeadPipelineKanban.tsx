import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { MoreHorizontal, Pencil, Trash2, Eye, Phone, Mail, Calendar, AlertTriangle, Clock, DollarSign, ArrowRightCircle, PartyPopper, Info } from "lucide-react";
import { toast } from "sonner";
import { format, isWithinInterval, isBefore, isAfter, differenceInDays, parseISO } from "date-fns";
import { ConvertLeadDialog } from "./ConvertLeadDialog";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const STAGE_DESCRIPTIONS: Record<string, string> = {
  new: "A brand-new inbound or outbound lead that hasn't been contacted yet. Capture their info and schedule the first touchpoint.",
  discovery_call: "An introductory call to understand the prospect's goals, pain points, and whether there's a mutual fit.",
  due_diligence: "Researching the prospect's business, competitors, and current setup to craft a tailored strategy.",
  proposal: "A formal proposal or scope of work has been sent. Waiting for the prospect to review and respond.",
  negotiation: "Actively discussing pricing, terms, or scope adjustments before closing the deal.",
  won: "The prospect has signed and is converting to a client. Onboarding begins!",
  lost: "The deal didn't close. Log the reason so we can learn and improve future outreach.",
};

const PIPELINE_STAGES = [
  { key: "new", label: "New Lead", color: "border-t-muted-foreground", bgHeader: "bg-muted/50" },
  { key: "discovery_call", label: "Discovery Call", color: "border-t-blue-500", bgHeader: "bg-blue-500/10" },
  { key: "due_diligence", label: "Due Diligence", color: "border-t-amber-500", bgHeader: "bg-amber-500/10" },
  { key: "proposal", label: "Proposal", color: "border-t-purple-500", bgHeader: "bg-purple-500/10" },
  { key: "negotiation", label: "Negotiation", color: "border-t-primary", bgHeader: "bg-primary/10" },
  { key: "won", label: "Won 🎉", color: "border-t-emerald-500", bgHeader: "bg-emerald-500/10" },
  { key: "lost", label: "Lost", color: "border-t-destructive", bgHeader: "bg-destructive/10" },
] as const;

interface LeadPipelineKanbanProps {
  leads: Client[];
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
}

function getFollowUpStatus(lead: Client): { label: string; color: string; icon: typeof Clock; days?: number } | null {
  const start = lead.follow_up_start;
  const end = lead.follow_up_end;
  if (!start || !end) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = parseISO(start);
  const endDate = parseISO(end);

  if (isBefore(today, startDate)) {
    const days = differenceInDays(startDate, today);
    return { label: `Follow-up in ${days}d`, color: "text-muted-foreground", icon: Clock, days };
  }
  if (isWithinInterval(today, { start: startDate, end: endDate })) {
    return { label: "Follow up now", color: "text-primary", icon: Calendar, days: 0 };
  }
  if (isAfter(today, endDate)) {
    const overdueDays = differenceInDays(today, endDate);
    return { label: `Overdue ${overdueDays}d`, color: "text-destructive", icon: AlertTriangle, days: -overdueDays };
  }
  return null;
}

function formatDealValue(fee: number | null, setup: number | null): string | null {
  const monthly = fee ?? 0;
  const oneTime = setup ?? 0;
  if (monthly === 0 && oneTime === 0) return null;
  const parts: string[] = [];
  if (monthly > 0) parts.push(`$${monthly.toLocaleString()}/mo`);
  if (oneTime > 0) parts.push(`$${oneTime.toLocaleString()} setup`);
  return parts.join(" + ");
}

export function LeadPipelineKanban({ leads, onEdit, onDelete }: LeadPipelineKanbanProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [convertLead, setConvertLead] = useState<Client | null>(null);

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase
        .from("clients")
        .update({ pipeline_stage: stage })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: () => toast.error("Failed to update pipeline stage"),
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStage = destination.droppableId;
    const lead = leads.find((l) => l.id === draggableId);
    if (!lead || lead.pipeline_stage === newStage) return;

    // If dragged to "won", open conversion dialog instead
    if (newStage === "won") {
      // First update the pipeline stage
      updateStage.mutate({ id: draggableId, stage: newStage });
      // Then open the conversion dialog
      setConvertLead(lead);
      return;
    }

    updateStage.mutate({ id: draggableId, stage: newStage });
    toast.success(`Moved to ${PIPELINE_STAGES.find((s) => s.key === newStage)?.label}`);
  };

  const getLeadsForStage = (stageKey: string) =>
    leads.filter((l) => (l.pipeline_stage ?? "new") === stageKey);

  // Pipeline metrics
  const activeLeads = leads.filter((l) => !["won", "lost"].includes(l.pipeline_stage ?? "new"));
  const wonCount = leads.filter((l) => l.pipeline_stage === "won").length;
  const lostCount = leads.filter((l) => l.pipeline_stage === "lost").length;
  const conversionRate = leads.length > 0 ? Math.round((wonCount / leads.length) * 100) : 0;
  const followUpsDue = leads.filter((l) => {
    const status = getFollowUpStatus(l);
    return status && (status.label.startsWith("Follow up") || status.label.startsWith("Overdue"));
  }).length;

  // Total pipeline value
  const pipelineValue = activeLeads.reduce((s, l) => {
    const annual = (l.monthly_fee ?? 0) * 12;
    const setup = l.setup_fee ?? 0;
    return s + annual + setup;
  }, 0);

  return (
    <div className="space-y-4">
      {/* Pipeline Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: "Total Leads", value: String(leads.length), accent: "text-foreground" },
          { label: "Active", value: String(activeLeads.length), accent: "text-primary" },
          { label: "Won", value: String(wonCount), accent: "text-emerald-500" },
          { label: "Lost", value: String(lostCount), accent: "text-destructive" },
          { label: "Follow-ups", value: String(followUpsDue), accent: followUpsDue > 0 ? "text-amber-500" : "text-muted-foreground" },
          { label: "Pipeline Value", value: pipelineValue > 0 ? `$${(pipelineValue / 1000).toFixed(0)}k` : "$0", accent: "text-primary" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-card px-3 py-2.5 text-center">
            <p className={`text-xl font-bold font-mono ${m.accent}`}>{m.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
          </div>
        ))}
      </div>
      {conversionRate > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${conversionRate}%` }} />
          </div>
          <span className="text-xs font-mono text-muted-foreground">{conversionRate}% conversion</span>
        </div>
      )}

      {/* Kanban */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[400px]">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = getLeadsForStage(stage.key);
            return (
              <div
                key={stage.key}
                className={`flex-shrink-0 w-[230px] rounded-lg border border-border ${stage.color} border-t-[3px] bg-card flex flex-col`}
              >
                <div className={`px-3 py-2.5 ${stage.bgHeader} rounded-t-lg`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
                        {stage.label}
                      </h3>
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground/80 cursor-help transition-colors" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[220px] text-xs leading-relaxed">
                            {STAGE_DESCRIPTIONS[stage.key]}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">
                      {stageLeads.length}
                    </Badge>
                  </div>
                </div>

                <Droppable droppableId={stage.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-2 space-y-2 min-h-[100px] transition-colors ${
                        snapshot.isDraggingOver ? "bg-accent/30" : ""
                      }`}
                    >
                      {stageLeads.map((lead, index) => {
                        const followUp = getFollowUpStatus(lead);
                        const lastContact = lead.last_contact_date;
                        const source = lead.lead_source;
                        const dealValue = formatDealValue(lead.monthly_fee, lead.setup_fee);

                        return (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`rounded-md border bg-card p-3 transition-shadow ${
                                  snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : "hover:shadow-sm"
                                } ${followUp?.label.startsWith("Overdue") ? "border-destructive/40" : ""} ${followUp?.label === "Follow up now" ? "border-primary/40" : ""}`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div
                                    className="min-w-0 flex-1 cursor-pointer"
                                    onClick={() => navigate(`/admin/clients/${lead.id}`)}
                                  >
                                    <p className="font-medium text-sm truncate">{lead.name}</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                      {lead.type ?? "No type"}
                                    </p>
                                  </div>
                                  <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                                          <MoreHorizontal className="h-3.5 w-3.5" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem onClick={() => navigate(`/admin/clients/${lead.id}`)}>
                                          <Eye className="mr-2 h-3.5 w-3.5" /> View Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => onEdit(lead)}>
                                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => setConvertLead(lead)} className="text-emerald-500 focus:text-emerald-500">
                                          <ArrowRightCircle className="mr-2 h-3.5 w-3.5" /> Convert to Client
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => onDelete(lead)} className="text-destructive focus:text-destructive">
                                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>

                                {/* Deal value */}
                                {dealValue && (
                                  <div className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-primary">
                                    <DollarSign className="h-3 w-3 shrink-0" />
                                    <span>{dealValue}</span>
                                  </div>
                                )}

                                {/* Contact info */}
                                <div className="mt-2 space-y-0.5">
                                  {lead.email && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                      <Mail className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{lead.email}</span>
                                    </div>
                                  )}
                                  {lead.phone && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                      <Phone className="h-3 w-3 shrink-0" />
                                      <span>{lead.phone}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Follow-up indicator */}
                                {followUp && (
                                  <div className={`flex items-center gap-1.5 mt-2 text-[11px] font-medium ${followUp.color}`}>
                                    <followUp.icon className="h-3 w-3 shrink-0" />
                                    <span>{followUp.label}</span>
                                  </div>
                                )}

                                {/* Last contact & source */}
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  {lastContact && (
                                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                                      <Calendar className="h-2.5 w-2.5 shrink-0" />
                                      {format(parseISO(lastContact), "MMM d")}
                                    </span>
                                  )}
                                  {source && (
                                    <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
                                      {source}
                                    </Badge>
                                  )}
                                </div>

                                {/* Won stage: show convert button */}
                                {stage.key === "won" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full mt-2 h-7 text-xs text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10"
                                    onClick={(e) => { e.stopPropagation(); setConvertLead(lead); }}
                                  >
                                    <PartyPopper className="h-3 w-3 mr-1" /> Convert to Client
                                  </Button>
                                )}

                                {/* Notes preview (only show if no other indicators) */}
                                {lead.notes && !followUp && !lastContact && !dealValue && (
                                  <p className="text-[10px] text-muted-foreground/70 mt-2 line-clamp-2 leading-relaxed">
                                    {lead.notes.slice(0, 80)}{lead.notes.length > 80 ? "…" : ""}
                                  </p>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Convert Lead Dialog */}
      <ConvertLeadDialog
        open={!!convertLead}
        onOpenChange={(open) => { if (!open) setConvertLead(null); }}
        lead={convertLead}
      />
    </div>
  );
}
