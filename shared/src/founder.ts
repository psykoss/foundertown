/**
 * Onboarding questions ("who are you in the startup world"). Pure data: the client renders the form
 * from it, the server validates answers against it, and other players see the labels on your card.
 */
export interface Option {
  id: string;
  label: string;
  hint?: string;
}

export const STAGES: Option[] = [
  { id: "idea", label: "Just an idea", hint: "Exploring what to build" },
  { id: "preseed", label: "Pre-seed", hint: "Building the first version" },
  { id: "seed", label: "Seed", hint: "Early product and first users" },
  { id: "series_a", label: "Series A", hint: "Scaling what works" },
  { id: "growth", label: "Series B+", hint: "Growth stage" },
  { id: "unicorn", label: "Unicorn", hint: "$1B+ company" },
  { id: "investor", label: "Investor / VC", hint: "Angel, scout or fund" },
  { id: "operator", label: "Startup operator", hint: "Working at a startup" },
  { id: "curious", label: "Just curious", hint: "Here to look around" },
];

export const GOALS: Option[] = [
  { id: "learn", label: "Learn from other founders" },
  { id: "cofounder", label: "Find a co-founder" },
  { id: "validate", label: "Validate an idea" },
  { id: "fundraise", label: "Meet investors" },
  { id: "customers", label: "Find early users" },
  { id: "hire", label: "Hire or join a team" },
  { id: "network", label: "Hang out and network" },
];

export const HEARD: Option[] = [
  { id: "friend", label: "A friend invited me" },
  { id: "x", label: "X / Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "producthunt", label: "Product Hunt" },
  { id: "community", label: "A community or newsletter" },
  { id: "search", label: "Search" },
  { id: "other", label: "Somewhere else" },
];

export const BUILDING_MAX = 80;
export const NAME_MAX = 24;

export interface FounderProfile {
  /** STAGES id */
  stage: string;
  /** One line about what they are working on (may be empty). */
  building: string;
  /** GOALS ids */
  goals: string[];
  /** HEARD id (may be empty) */
  heard: string;
}

export const EMPTY_FOUNDER: FounderProfile = { stage: "", building: "", goals: [], heard: "" };

const has = (options: Option[], id: unknown): id is string => typeof id === "string" && options.some((o) => o.id === id);

export function optionLabel(options: Option[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? "";
}

/** Coerce untrusted input (network, database, storage) into a valid profile; unknown answers are dropped. */
export function sanitizeFounder(input: unknown): FounderProfile {
  const i = (input ?? {}) as Partial<Record<keyof FounderProfile, unknown>>;
  return {
    stage: has(STAGES, i.stage) ? i.stage : "",
    building: typeof i.building === "string" ? i.building.trim().slice(0, BUILDING_MAX) : "",
    goals: Array.isArray(i.goals) ? [...new Set(i.goals.filter((g): g is string => has(GOALS, g)))] : [],
    heard: has(HEARD, i.heard) ? i.heard : "",
  };
}

export function sanitizeName(input: unknown, fallback = "Founder"): string {
  const name = typeof input === "string" ? input.trim().slice(0, NAME_MAX) : "";
  return name || fallback;
}
