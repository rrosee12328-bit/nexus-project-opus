import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLogger";

interface DeleteClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
}

export function DeleteClientDialog({ open, onOpenChange, clientId, clientName }: DeleteClientDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      // Delete related records first to avoid FK constraint errors
      await supabase.from("client_notes").delete().eq("client_id", clientId);
      await supabase.from("client_onboarding_steps").delete().eq("client_id", clientId);
      await supabase.from("client_payments").delete().eq("client_id", clientId);
      await supabase.from("client_costs").delete().eq("client_id", clientId);
      await supabase.from("assets").delete().eq("client_id", clientId);
      await supabase.from("messages").delete().eq("client_id", clientId);
      // Delete projects and their related records
      const { data: projects } = await supabase.from("projects").select("id").eq("client_id", clientId);
      if (projects?.length) {
        const projectIds = projects.map(p => p.id);
        await supabase.from("project_activity_log").delete().in("project_id", projectIds);
        await supabase.from("project_phases").delete().in("project_id", projectIds);
        await supabase.from("project_attachments").delete().in("project_id", projectIds);
        await supabase.from("projects").delete().eq("client_id", clientId);
      }
      // Delete tasks linked to this client
      const { data: tasks } = await supabase.from("tasks").select("id").eq("client_id", clientId);
      if (tasks?.length) {
        const taskIds = tasks.map(t => t.id);
        await supabase.from("task_attachments").delete().in("task_id", taskIds);
        await supabase.from("tasks").delete().eq("client_id", clientId);
      }
      const { error } = await supabase.from("clients").delete().eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Client deleted" });
      logActivity("deleted_client", "client", clientId, `Deleted client "${clientName}"`);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{clientName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this client and all their payment records. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
