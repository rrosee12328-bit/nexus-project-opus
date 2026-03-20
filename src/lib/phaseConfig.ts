/**
 * Central phase configuration for the Vektiss project lifecycle.
 *
 * Main phases: Discovery → Development → Deploy
 * Each main phase contains sub-phases that map to the DB enum values.
 */

export interface SubPhase {
  key: string;          // DB enum value
  label: string;
  description: string;
  icon: string;
}

export interface MainPhase {
  key: string;          // grouping key (not a DB value itself unless it matches one)
  label: string;
  description: string;
  icon: string;
  subPhases: SubPhase[];
}

export const MAIN_PHASES: MainPhase[] = [
  {
    key: "discovery",
    label: "Discovery",
    description: "Understanding goals, audience, and project scope",
    icon: "🔍",
    subPhases: [
      { key: "discovery", label: "Discovery", description: "Understanding goals, audience, and brand identity", icon: "🔍" },
    ],
  },
  {
    key: "development",
    label: "Development",
    description: "Designing and building the product",
    icon: "⚙️",
    subPhases: [
      { key: "design", label: "Design", description: "Creating visual concepts and layouts", icon: "🎨" },
      { key: "development", label: "Build", description: "Implementing the final product", icon: "⚙️" },
    ],
  },
  {
    key: "deploy",
    label: "Deploy",
    description: "Review, QA, and launch",
    icon: "🚀",
    subPhases: [
      { key: "review", label: "Review", description: "Fine-tuning details based on feedback", icon: "👀" },
      { key: "launch", label: "Launch", description: "Final QA and going live", icon: "🚀" },
      { key: "deploy", label: "Deploy", description: "Deployed and delivered", icon: "✅" },
    ],
  },
];

/** Flat lookup: DB enum key → display label */
export const PHASE_LABELS: Record<string, string> = Object.fromEntries(
  MAIN_PHASES.flatMap((m) => m.subPhases.map((s) => [s.key, s.label]))
);

/** Flat lookup: DB enum key → description */
export const PHASE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  MAIN_PHASES.flatMap((m) => m.subPhases.map((s) => [s.key, s.description]))
);

/** Flat lookup: DB enum key → emoji icon */
export const PHASE_ICONS: Record<string, string> = Object.fromEntries(
  MAIN_PHASES.flatMap((m) => m.subPhases.map((s) => [s.key, s.icon]))
);

/** All valid DB enum keys in lifecycle order */
export const ALL_PHASE_KEYS = MAIN_PHASES.flatMap((m) => m.subPhases.map((s) => s.key));

/** Given a sub-phase DB key, return which main phase group it belongs to */
export function getMainPhaseFor(subPhaseKey: string): MainPhase | undefined {
  return MAIN_PHASES.find((m) => m.subPhases.some((s) => s.key === subPhaseKey));
}
