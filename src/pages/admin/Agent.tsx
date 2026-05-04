import { useLocation } from "react-router-dom";
import AIAgentChat from "@/components/AIAgentChat";

export default function AgentPage() {
  const location = useLocation();

  // Parse session context from URL state if navigated from a specific page
  const state = location.state as {
    entityType?: string;
    entityId?: string;
    entityName?: string;
    page?: string;
    initialPrompt?: string;
  } | null;

  return (
    <AIAgentChat
      title="Assistant"
      subtitle="Ask anything about your operations, clients, and projects."
      suggestions={[
        "Give me a full operational briefing",
        "Show all at-risk clients this week",
        "Find projects waiting on assets and create follow-up tasks",
        "Move overdue content tasks into follow-up",
        "Draft this week's client updates",
        "Which clients need attention today?",
      ]}
      sessionContext={state ? {
        page: state.page,
        entityType: state.entityType,
        entityId: state.entityId,
        entityName: state.entityName,
      } : undefined}
      initialPrompt={state?.initialPrompt}
    />
  );
}
