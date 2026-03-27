/**
 * AI Command Center — Context-aware suggestion engine
 * Maps role + page context to smart suggestions and one-click actions.
 */

export type AIRole = "admin" | "ops" | "client";

export interface AISuggestion {
  label: string;
  prompt: string;
  icon?: "summary" | "health" | "finance" | "risk" | "task" | "timeline" | "report" | "upsell" | "draft" | "checklist" | "bottleneck" | "compare";
  category?: "analysis" | "action" | "report" | "communication";
}

export interface AIPageContext {
  pageType: string;
  title: string;
  entityId?: string;
  entityName?: string;
  /** Extra data hints the AI can use for smarter prompts */
  dataHints?: Record<string, string | number | boolean>;
}

// ─── Admin suggestions ────────────────────────────────────────────────

const ADMIN_DASHBOARD: AISuggestion[] = [
  { label: "Company Snapshot", prompt: "Give me a full company snapshot right now. Include active clients, MRR, active projects, overdue tasks, and any risks.", icon: "summary", category: "report" },
  { label: "Clients Needing Attention", prompt: "What clients need my attention today? Look at overdue tasks, pending approvals, missing payments, and communication gaps.", icon: "health", category: "analysis" },
  { label: "Revenue Summary", prompt: "Generate a revenue summary. Show MRR, YTD revenue, revenue by client, and compare this month vs last month.", icon: "finance", category: "report" },
  { label: "Operational Bottlenecks", prompt: "Identify the biggest operational bottlenecks right now. Look at overdue tasks, blocked projects, team workload, and delivery delays.", icon: "bottleneck", category: "analysis" },
  { label: "At-Risk Accounts", prompt: "Which accounts are most at risk of churning? Analyze communication frequency, project delays, payment history, and satisfaction signals.", icon: "risk", category: "analysis" },
  { label: "Upsell Opportunities", prompt: "What upsell opportunities exist right now? Look at active clients, their current packages, and potential service expansions.", icon: "upsell", category: "analysis" },
];

const ADMIN_CLIENT_DETAIL: AISuggestion[] = [
  { label: "Client Health Report", prompt: "Generate a complete health report for this client. Include project status, payment history, communication frequency, open items, and risk factors.", icon: "health", category: "report" },
  { label: "Revenue & Margin", prompt: "Show the revenue and estimated profit margin for this client. Include monthly fee, setup fee, internal costs, and delivery cost analysis.", icon: "finance", category: "analysis" },
  { label: "Open Deliverables", prompt: "Show all open deliverables and pending items for this client across all projects.", icon: "task", category: "analysis" },
  { label: "Communication Summary", prompt: "Summarize the communication history with this client. Include recent messages, meeting notes, and response patterns.", icon: "summary", category: "report" },
  { label: "Draft Client Update", prompt: "Draft a professional status update email for this client covering project progress, next steps, and any items needing their attention.", icon: "draft", category: "communication" },
  { label: "Suggest Upsell", prompt: "Based on this client's current services and project history, suggest potential upsell opportunities with estimated value.", icon: "upsell", category: "analysis" },
];

const ADMIN_PROJECTS: AISuggestion[] = [
  { label: "Project Health Overview", prompt: "Generate a health report across all active projects. Show status, progress, risks, and which ones are behind schedule.", icon: "health", category: "report" },
  { label: "Current Risks", prompt: "What risks could delay active projects? Look at overdue tasks, missing assets, pending approvals, and team capacity.", icon: "risk", category: "analysis" },
  { label: "Delivery Timeline", prompt: "Show the delivery timeline for all active projects including milestones completed, current phase, and estimated completion.", icon: "timeline", category: "analysis" },
  { label: "Executive Summary", prompt: "Generate an executive summary of all projects suitable for leadership review.", icon: "report", category: "report" },
];

const ADMIN_FINANCIALS: AISuggestion[] = [
  { label: "Revenue Summary", prompt: "Generate a comprehensive revenue summary. Include total revenue, MRR, revenue by client, and month-over-month trends.", icon: "finance", category: "report" },
  { label: "Most Profitable Clients", prompt: "Which clients are most profitable? Compare revenue vs internal costs and estimated labor time.", icon: "finance", category: "analysis" },
  { label: "Unpaid Invoices", prompt: "Show all unpaid invoices and overdue balances across all clients.", icon: "risk", category: "analysis" },
  { label: "Month Comparison", prompt: "Compare this month's financial performance vs last month. Include revenue, expenses, and net profit.", icon: "compare", category: "report" },
  { label: "Forecast Revenue", prompt: "Forecast next month's revenue based on current active clients, their payment history, and pipeline leads.", icon: "finance", category: "report" },
];

const ADMIN_LEADS: AISuggestion[] = [
  { label: "Pipeline Summary", prompt: "Give me a summary of the current sales pipeline. Show deals by stage, total pipeline value, and conversion rates.", icon: "summary", category: "report" },
  { label: "Deals Needing Follow-up", prompt: "Which leads need follow-up? Look at last contact dates and follow-up windows.", icon: "task", category: "analysis" },
  { label: "Conversion Analysis", prompt: "Analyze our lead conversion performance. What stage do we lose the most deals?", icon: "compare", category: "analysis" },
];

const ADMIN_MESSAGES: AISuggestion[] = [
  { label: "Unread Summary", prompt: "Summarize all unread client messages and highlight any that need urgent attention.", icon: "summary", category: "analysis" },
  { label: "Communication Gaps", prompt: "Which clients haven't been contacted recently? Show the last communication date for each.", icon: "risk", category: "analysis" },
];

const ADMIN_CALENDAR: AISuggestion[] = [
  { label: "Week Overview", prompt: "Give me an overview of this week's calendar events, meetings, and deadlines.", icon: "summary", category: "report" },
  { label: "Schedule Conflicts", prompt: "Are there any scheduling conflicts or overlapping events this week?", icon: "risk", category: "analysis" },
];

const ADMIN_REPORTS: AISuggestion[] = [
  { label: "Executive Report", prompt: "Generate a full executive report covering revenue, client health, project status, and team performance.", icon: "report", category: "report" },
  { label: "Monthly Performance", prompt: "Show this month's performance metrics including revenue, completion rate, and client satisfaction indicators.", icon: "compare", category: "report" },
];

// ─── Ops suggestions ──────────────────────────────────────────────────

const OPS_DASHBOARD: AISuggestion[] = [
  { label: "My Task Summary", prompt: "What tasks are assigned to me? Show by priority and due date.", icon: "task", category: "analysis" },
  { label: "Overdue Tasks", prompt: "Show all overdue tasks across all projects with their priority levels.", icon: "risk", category: "analysis" },
  { label: "Today's Focus", prompt: "What should I focus on today? Prioritize by urgency, deadlines, and impact.", icon: "checklist", category: "analysis" },
  { label: "Blocked Projects", prompt: "Which projects are blocked and what's causing the blockage?", icon: "bottleneck", category: "analysis" },
];

const OPS_TASKS: AISuggestion[] = [
  { label: "Summarize Workload", prompt: "Summarize my current workload. How many tasks by status, priority, and estimated effort?", icon: "summary", category: "report" },
  { label: "Missing Inputs", prompt: "Which tasks are waiting on client assets, approvals, or other inputs?", icon: "risk", category: "analysis" },
  { label: "Draft Status Update", prompt: "Draft an internal status update covering completed tasks, in-progress work, and blockers.", icon: "draft", category: "communication" },
  { label: "Predict Delay Risk", prompt: "Which tasks are most likely to be delayed based on current progress and due dates?", icon: "risk", category: "analysis" },
  { label: "This Week's Deliverables", prompt: "What deliverables are due in the next 7 days?", icon: "timeline", category: "analysis" },
];

const OPS_TIMESHEETS: AISuggestion[] = [
  { label: "Hours This Week", prompt: "How many hours did I log this week? Break down by category.", icon: "summary", category: "report" },
  { label: "Time by Client", prompt: "Show my time allocation by client this week.", icon: "compare", category: "analysis" },
];

const OPS_SOPS: AISuggestion[] = [
  { label: "Find SOP", prompt: "What SOPs are available? List them by category.", icon: "summary", category: "analysis" },
  { label: "Onboarding Process", prompt: "What is the SOP for client onboarding?", icon: "checklist", category: "analysis" },
];

// ─── Client suggestions ───────────────────────────────────────────────

const CLIENT_DASHBOARD: AISuggestion[] = [
  { label: "Project Progress", prompt: "Summarize my project progress. What phase are we in and what percentage is complete?", icon: "summary", category: "report" },
  { label: "Next Steps", prompt: "What are the next steps in my project? What milestones are coming up?", icon: "timeline", category: "analysis" },
  { label: "Pending Approvals", prompt: "Are there any deliverables waiting for my approval?", icon: "task", category: "analysis" },
  { label: "Monthly Report", prompt: "Generate a monthly progress report for my project.", icon: "report", category: "report" },
];

const CLIENT_PROJECTS: AISuggestion[] = [
  { label: "Project Status", prompt: "What's the current status of my project? Show phase, progress, and timeline.", icon: "summary", category: "report" },
  { label: "Milestones Completed", prompt: "What milestones have been completed so far?", icon: "checklist", category: "analysis" },
  { label: "Upcoming Deadlines", prompt: "What deadlines are coming up for my project?", icon: "timeline", category: "analysis" },
];

const CLIENT_BILLING: AISuggestion[] = [
  { label: "Payment History", prompt: "Show my complete payment history.", icon: "finance", category: "report" },
  { label: "Outstanding Balance", prompt: "Do I have any outstanding balance or upcoming payments?", icon: "finance", category: "analysis" },
];

const CLIENT_MESSAGES: AISuggestion[] = [
  { label: "Recent Updates", prompt: "Summarize recent messages and updates from my team.", icon: "summary", category: "analysis" },
];

const CLIENT_ASSETS: AISuggestion[] = [
  { label: "My Assets", prompt: "What assets have been uploaded for my project?", icon: "summary", category: "analysis" },
  { label: "Missing Assets", prompt: "Are there any assets still needed from me?", icon: "risk", category: "analysis" },
];

const CLIENT_APPROVALS: AISuggestion[] = [
  { label: "Pending Reviews", prompt: "What deliverables are waiting for my review and approval?", icon: "task", category: "analysis" },
  { label: "Approval History", prompt: "Show my approval history including what I've approved and rejected.", icon: "summary", category: "report" },
];

// ─── Page context mapping ─────────────────────────────────────────────

const SUGGESTION_MAP: Record<AIRole, Record<string, AISuggestion[]>> = {
  admin: {
    dashboard: ADMIN_DASHBOARD,
    clients: ADMIN_CLIENT_DETAIL,
    "client-detail": ADMIN_CLIENT_DETAIL,
    projects: ADMIN_PROJECTS,
    financials: ADMIN_FINANCIALS,
    leads: ADMIN_LEADS,
    messages: ADMIN_MESSAGES,
    calendar: ADMIN_CALENDAR,
    reports: ADMIN_REPORTS,
    assets: [],
    emails: [],
    proposals: ADMIN_LEADS,
    settings: [],
    agent: ADMIN_DASHBOARD,
  },
  ops: {
    dashboard: OPS_DASHBOARD,
    tasks: OPS_TASKS,
    timesheets: OPS_TIMESHEETS,
    sops: OPS_SOPS,
    agent: OPS_DASHBOARD,
    settings: [],
  },
  client: {
    dashboard: CLIENT_DASHBOARD,
    projects: CLIENT_PROJECTS,
    billing: CLIENT_BILLING,
    messages: CLIENT_MESSAGES,
    assets: CLIENT_ASSETS,
    approvals: CLIENT_APPROVALS,
    agent: CLIENT_DASHBOARD,
    settings: [],
  },
};

/**
 * Get contextual AI suggestions for the current page and role.
 */
export function getAISuggestions(role: AIRole, pageType: string): AISuggestion[] {
  return SUGGESTION_MAP[role]?.[pageType] ?? [];
}

/**
 * Enrich a prompt with entity context if available.
 */
export function enrichPrompt(prompt: string, context?: AIPageContext): string {
  if (!context?.entityName) return prompt;
  return `${prompt}\n\nContext: Currently viewing ${context.entityName}${context.entityId ? ` (ID: ${context.entityId})` : ""}.`;
}
