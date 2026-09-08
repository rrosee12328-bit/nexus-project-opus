import { useLocation } from "react-router-dom";
import AIAgentChat from "@/components/AIAgentChat";

export default function ClientAgent() {
  const location = useLocation();
  const state = location.state as { entityType?: string; entityId?: string; entityName?: string; page?: string } | null;

  return (
    <AIAgentChat
      title="Ask Vektiss"
      subtitle="Ask about your project, recent meetings, agreements, billing, files, or what happens next."
      suggestions={[
        "What needs my attention today?",
        "What's the latest update on my project?",
        "What did we decide in our last meeting?",
        "Are my agreement and billing up to date?",
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
