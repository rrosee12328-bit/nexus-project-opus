import { useLocation } from "react-router-dom";
import AIAgentChat from "@/components/AIAgentChat";

export default function ClientAgent() {
  const location = useLocation();
  const state = location.state as { entityType?: string; entityId?: string; entityName?: string; page?: string } | null;

  return (
    <AIAgentChat
      title="Vektiss Assistant"
      subtitle="Check your project status, payment history, assets, or send a message to the team."
      suggestions={[
        "What's the status of my project?",
        "Show my payment history",
        "What assets have been uploaded?",
        "Are there any deliverables waiting for my approval?",
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
