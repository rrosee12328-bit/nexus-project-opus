import { useLocation } from "react-router-dom";
import AIAgentChat from "@/components/AIAgentChat";

export default function OpsAgent() {
  const location = useLocation();
  const state = location.state as { entityType?: string; entityId?: string; entityName?: string; page?: string } | null;

  return (
    <AIAgentChat
      title="Ops Agent"
      subtitle="Manage tasks, update statuses, check timesheets, and reference SOPs."
      suggestions={[
        "What tasks are assigned to me?",
        "Show me overdue tasks and suggest next steps",
        "How many hours did I log this week?",
        "Find the SOP for client onboarding",
        "What deliverables are due in the next 7 days?",
        "Summarize my current workload",
      ]}
      sessionContext={state ? {
        page: state.page,
        entityType: state.entityType,
        entityId: state.entityId,
        entityName: state.entityName,
      } : undefined}
    />
  );
}
