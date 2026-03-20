import AIAgentChat from "@/components/AIAgentChat";

export default function ClientAgent() {
  return (
    <AIAgentChat
      title="Vektiss Assistant"
      subtitle="Check your project status, payment history, assets, or send a message to the team."
      suggestions={[
        "What's the status of my project?",
        "Show my payment history",
        "What assets have been uploaded?",
        "Send a message to my team",
      ]}
    />
  );
}
