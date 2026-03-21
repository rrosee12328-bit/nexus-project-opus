import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
      if (!clientId) throw new Error("Missing client ID");

      const deleteByClientId = async (
        table:
          | "client_notes"
          | "client_onboarding_steps"
          | "client_payments"
          | "client_costs"
          | "assets"
          | "messages",
      ) => {
        const { error } = await supabase.from(table).delete().eq("client_id", clientId);
        if (error) throw error;
      };

      await deleteByClientId("client_notes");
      await deleteByClientId("client_onboarding_steps");
      await deleteByClientId("client_payments");
      await deleteByClientId("client_costs");
      await deleteByClientId("assets");
      await deleteByClientId("messages");

      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id")
        .eq("client_id", clientId);
      if (projectsError) throw projectsError;

      if (projects.length) {
        const projectIds = projects.map((project) => project.id);

        const { error: activityError } = await supabase
          .from("project_activity_log")
          .delete()
          .in("project_id", projectIds);
        if (activityError) throw activityError;

        const { error: phasesError } = await supabase
          .from("project_phases")
          .delete()
          .in("project_id", projectIds);
        if (phasesError) throw phasesError;

        const { error: attachmentsError } = await supabase
          .from("project_attachments")
          .delete()
          .in("project_id", projectIds);
        if (attachmentsError) throw attachmentsError;

        const { error: projectsDeleteError } = await supabase
          .from("projects")
          .delete()
          .eq("client_id", clientId);
        if (projectsDeleteError) throw projectsDeleteError;
      }

      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("id")
        .eq("client_id", clientId);
      if (tasksError) throw tasksError;

      if (tasks.length) {
        const taskIds = tasks.map((task) => task.id);

        const { error: taskAttachmentsError } = await supabase
          .from("task_attachments")
          .delete()
          .in("task_id", taskIds);
        if (taskAttachmentsError) throw taskAttachmentsError;

        const { error: tasksDeleteError } = await supabase
          .from("tasks")
          .delete()
          .eq("client_id", clientId);
        if (tasksDeleteError) throw tasksDeleteError;
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
    <AlertDialog open={open} onOpenChange={(nextOpen) => !mutation.isPending && onOpenChange(nextOpen)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{clientName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this client and all their related records. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending || !clientId}>
            {mutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
