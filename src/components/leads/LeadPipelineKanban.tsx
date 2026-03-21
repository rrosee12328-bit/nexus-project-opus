import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Eye, Phone, Mail, Calendar } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

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

export function LeadPipelineKanban({ leads, onEdit, onDelete }: LeadPipelineKanbanProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
    updateStage.mutate({ id: draggableId, stage: newStage });
    toast.success(`Moved to ${PIPELINE_STAGES.find((s) => s.key === newStage)?.label}`);
  };

  const getLeadsForStage = (stageKey: string) =>
    leads.filter((l) => (l.pipeline_stage ?? "new") === stageKey);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[400px]">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = getLeadsForStage(stage.key);
          return (
            <div
              key={stage.key}
              className={`flex-shrink-0 w-[220px] rounded-lg border border-border ${stage.color} border-t-[3px] bg-card flex flex-col`}
            >
              {/* Column header */}
              <div className={`px-3 py-2.5 ${stage.bgHeader} rounded-t-lg`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
                    {stage.label}
                  </h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">
                    {stageLeads.length}
                  </Badge>
                </div>
              </div>

              {/* Droppable area */}
              <Droppable droppableId={stage.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 p-2 space-y-2 min-h-[100px] transition-colors ${
                      snapshot.isDraggingOver ? "bg-accent/30" : ""
                    }`}
                  >
                    {stageLeads.map((lead, index) => (
                      <Draggable key={lead.id} draggableId={lead.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`rounded-md border bg-card p-3 transition-shadow ${
                              snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : "hover:shadow-sm"
                            }`}
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
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem onClick={() => navigate(`/admin/clients/${lead.id}`)}>
                                      <Eye className="mr-2 h-3.5 w-3.5" /> View
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onEdit(lead)}>
                                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onDelete(lead)} className="text-destructive focus:text-destructive">
                                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>

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

                            {/* Notes preview */}
                            {lead.notes && (
                              <p className="text-[10px] text-muted-foreground/70 mt-2 line-clamp-2 leading-relaxed">
                                {lead.notes.slice(0, 80)}{lead.notes.length > 80 ? "…" : ""}
                              </p>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
