import AIAgentChat from "@/components/AIAgentChat";

export default function AgentPage() {
  return (
    <AIAgentChat
      title="AI Agent"
      subtitle="Query client data, update financials, create tasks, send messages, and analyze your agency's performance."
      suggestions={[
        "Give me an overdue summary",
        "How are we doing financially this year?",
        "What's the status on all active projects?",
        "Which clients have unpaid balances?",
      ]}
    />
  );
}
