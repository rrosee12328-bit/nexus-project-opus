export const discoveryGroups = [
  { title: "Customer Communication", questions: [
    "Approximately how many calls and messages do you receive each day?",
    "Who currently answers calls, texts, and appointment questions?",
    "What happens when a customer calls after hours or no one is available?",
    "How are appointment updates and provider ETAs communicated?",
  ] },
  { title: "Scheduling & Field Operations", questions: [
    "What software are you currently using to book and schedule appointments?",
    "How are providers assigned to appointments and dispatched?",
    "How do providers report arrival, treatment progress, and completion?",
    "Where are treatment notes and other patient information currently recorded?",
    "What part of coordinating your team takes the most time?",
  ] },
  { title: "Pharmacy Partnerships", questions: [
    "What specific IV products, formulations, or pharmacy capabilities are required?",
    "How do you currently identify and qualify pharmacy partners?",
    "What makes a pharmacy a good fit beyond the products it offers?",
    "Who manages outreach and follow-up today?",
    "How many qualified pharmacy conversations would you like to generate each month?",
  ] },
  { title: "Business Priorities", questions: [
    "Which of these three challenges is the most urgent?",
    "How much staff time is currently spent managing these processes?",
    "What would a successful first 90 days look like?",
    "Who would be involved in approving and implementing a solution?",
  ] },
];
export const discoveryQuestions = discoveryGroups.flatMap(group => group.questions);
