/**
 * Progressive Discovery — Auto-Phase Matrix Selection
 *
 * Shared between the CLI (forge suggest-topics), AI Studio, and Compact Generator.
 * When generating subtopics for a theme, auto-selects which Types/Domains/Styles
 * the AI can use based on how many topics already exist.
 *
 * Phases:
 *   1. SEED (0 topics):   Foundational — Core, Facts+Stories, Classic
 *   2. EXPAND (1-3):      Broaden — +Niche, Human, Concepts, Visual
 *   3. DIVERSIFY (4-7):   Deepen — +Surprise, Scale, Data, Timeline
 *   4. COMPLETE (8+):     Full spectrum, fill remaining gaps
 */

import type {
  TopicType,
  KnowledgeDomain,
  QuizStyle,
} from "../lib/ai/types";
import {
  ALL_TOPIC_TYPES,
  ALL_KNOWLEDGE_DOMAINS,
  ALL_QUIZ_STYLES,
} from "../lib/ai/types";

export interface PhaseConfig {
  phase: number; // 1–4
  label: string;
  types: TopicType[];
  domains: KnowledgeDomain[];
  styles: QuizStyle[];
  rationale: string;
}

export interface ExistingTopicInfo {
  name: string;
  tags: string[];
}

export function determinePhase(existingTopics: ExistingTopicInfo[]): PhaseConfig {
  // Filter out placeholder topics
  const realTopics = existingTopics.filter((r) => !r.name.includes("(Placeholder)"));
  const count = realTopics.length;

  // Analyze which Types/Domains/Styles are already covered
  const coveredTypes = new Set<string>();
  const coveredDomains = new Set<string>();
  const coveredStyles = new Set<string>();
  for (const row of realTopics) {
    for (const t of row.tags || []) {
      if (ALL_TOPIC_TYPES.includes(t as TopicType)) coveredTypes.add(t);
      if (ALL_KNOWLEDGE_DOMAINS.includes(t as KnowledgeDomain)) coveredDomains.add(t);
      if (ALL_QUIZ_STYLES.includes(t as QuizStyle)) coveredStyles.add(t);
    }
  }

  if (count === 0) {
    return {
      phase: 1,
      label: "SEED",
      types: ["Core"],
      domains: ["Facts", "Stories"],
      styles: ["Classic"],
      rationale: "Empty theme — starting with foundational, obvious topics first",
    };
  }

  if (count <= 3) {
    return {
      phase: 2,
      label: "EXPAND",
      types: ["Core", "Niche", "Human"],
      domains: ["Facts", "Stories", "Concepts"],
      styles: ["Classic", "Visual"],
      rationale: `${count} topic(s) exist — broadening to people stories, concepts, visual styles`,
    };
  }

  if (count <= 7) {
    return {
      phase: 3,
      label: "DIVERSIFY",
      types: ["Core", "Niche", "Human", "Surprise", "Scale"],
      domains: ["Facts", "Stories", "Concepts", "Data"],
      styles: ["Classic", "Visual", "Timeline"],
      rationale: `${count} topics — adding surprise angles, data-driven, and timeline styles`,
    };
  }

  // Phase 4 — COMPLETE: Full spectrum, fill remaining gaps
  const typeCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  const styleCounts = new Map<string, number>();
  for (const row of realTopics) {
    for (const t of row.tags || []) {
      if (ALL_TOPIC_TYPES.includes(t as TopicType))
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      if (ALL_KNOWLEDGE_DOMAINS.includes(t as KnowledgeDomain))
        domainCounts.set(t, (domainCounts.get(t) || 0) + 1);
      if (ALL_QUIZ_STYLES.includes(t as QuizStyle))
        styleCounts.set(t, (styleCounts.get(t) || 0) + 1);
    }
  }

  let types = ALL_TOPIC_TYPES.filter((t) => (typeCounts.get(t) || 0) < 3) as TopicType[];
  let domains = ALL_KNOWLEDGE_DOMAINS.filter(
    (d) => (domainCounts.get(d) || 0) < 3,
  ) as KnowledgeDomain[];
  let styles = ALL_QUIZ_STYLES.filter(
    (s) => (styleCounts.get(s) || 0) < 3,
  ) as QuizStyle[];

  // Fallback if everything is well-covered
  if (types.length === 0) types = [...ALL_TOPIC_TYPES];
  if (domains.length === 0) domains = [...ALL_KNOWLEDGE_DOMAINS];
  if (styles.length === 0) styles = [...ALL_QUIZ_STYLES];

  const gapTypes = ALL_TOPIC_TYPES.filter((t) => !coveredTypes.has(t));
  const gapDomains = ALL_KNOWLEDGE_DOMAINS.filter((d) => !coveredDomains.has(d));
  const gapStyles = ALL_QUIZ_STYLES.filter((s) => !coveredStyles.has(s));

  let rationale = `${count} topics — full spectrum`;
  if (gapTypes.length > 0) rationale += `, filling type gaps: ${gapTypes.join(", ")}`;
  if (gapDomains.length > 0) rationale += `, filling domain gaps: ${gapDomains.join(", ")}`;
  if (gapStyles.length > 0) rationale += `, filling style gaps: ${gapStyles.join(", ")}`;

  return { phase: 4, label: "COMPLETE", types, domains, styles, rationale };
}

/** Icons for each phase */
export const PHASE_ICONS: Record<number, string> = {
  1: "🌱",
  2: "🌿",
  3: "🌳",
  4: "🏆",
};
