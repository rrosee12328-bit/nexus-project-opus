import AIAgentChat from "@/components/AIAgentChat";

export default function OpsAgent() {
  return (
    <AIAgentChat
      title="Ops Assistant"
      subtitle="Manage tasks, check timesheets, reference SOPs, and stay on top of project work."
      suggestions={[
        "What tasks are assigned to me?",
        "Show me overdue tasks",
        "How many hours did I log this week?",
        "Find the SOP for client onboarding",
      ]}
    />
  );
}
