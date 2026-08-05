/**
 * Deterministic resolution of a "forget this memory" query to stored facts.
 *
 * The chat model is instructed to pass the fact's content VERBATIM (it sees the
 * bullets in its system prompt), so the exact-match path is the common case.
 * Fuzzy matching (Dice coefficient over token sets) exists for the first call in
 * a conversation, where the model may only have the user's paraphrase to go on.
 * Pure functions, no I/O — the tool handler owns fetching and deletion.
 */

import type { Fact } from "./types.js";

/** Best group must score at least this to count as a match at all. */
export const MATCH_THRESHOLD = 0.6;
/** A runner-up within this gap of the best (and above threshold) forces disambiguation. */
export const AMBIGUITY_GAP = 0.15;
/** Below MATCH_THRESHOLD but at/above this, near-misses are offered as suggestions. */
export const SUGGESTION_THRESHOLD = 0.35;
/** Cap on candidates/suggestions returned — more than this overwhelms voice replies. */
export const MAX_CANDIDATES = 4;

/**
 * Similarity at which post-turn extraction treats a newly extracted fact as
 * re-learning a memory the user just forgot, and drops it.
 *
 * Deliberately much stricter than MATCH_THRESHOLD. A REPLACEMENT keeps the
 * frame and changes the value — "User's name is Jure" → "User's name is HAL
 * 9000" scores 0.73 — and must survive, because "forget I'm Jure, I'm HAL now"
 * is the single most likely way this feature gets used (it is literally issue
 * #54). A RE-LEARN restates the same claim — "The user's name is Jure" scores
 * 0.91 — and must not. 0.85 separates those two populations; it is a heuristic,
 * not a guarantee, and the real safety net stays the confirm gate.
 */
export const FORGET_FILTER_THRESHOLD = 0.85;

/** A set of stored facts sharing identical normalized content (duplicates are one memory). */
export interface FactGroup {
  /** Original content of the first fact in the group (display form). */
  content: string;
  /** Normalized content — the confirm gate's identity for this memory. */
  normalized: string;
  /** Every Shodh id carrying this content; commit deletes them all. */
  ids: string[];
}

export type ResolutionResult =
  | { status: "match"; group: FactGroup }
  | { status: "ambiguous"; candidates: FactGroup[] }
  | { status: "none"; suggestions: string[] };

/**
 * Lowercase, strip everything that isn't a letter or number (Unicode-aware, so
 * diacritics like č/š/ž survive), collapse runs to single spaces.
 */
export function normalizeFactContent(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter((t) => t.length > 0));
}

/**
 * How alike two fact contents are, 0..1 — the same measure resolution uses.
 *
 * Used by post-turn extraction to drop anything that would re-teach a memory
 * the user just forgot (the extractor sees the "forget that X" transcript and
 * would happily learn X straight back, under a new id the delete can't reach).
 */
export function contentSimilarity(a: string, b: string): number {
  const normA = normalizeFactContent(a);
  const normB = normalizeFactContent(b);
  if (normA.length === 0 || normB.length === 0) return 0;
  if (normA === normB) return 1;
  return diceScore(tokenSet(normA), tokenSet(normB));
}

/** Dice coefficient over token sets: 2·|A∩B| / (|A|+|B|). */
function diceScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return (2 * overlap) / (a.size + b.size);
}

interface ScoredGroup extends FactGroup {
  score: number;
  exact: boolean;
  /** Newest createdAt in the group — deterministic tie-break, newest first. */
  newestCreatedAt: number;
}

/**
 * Resolve a forget query against ALL of a user's facts.
 *
 * Facts with identical normalized content form one group (deleting "the" memory
 * must delete every duplicate, or the user sees it survive). Decision rules:
 *  - exact normalized equality → match, unconditionally (verbatim confirm calls
 *    must never be derailed into disambiguation by a near-duplicate)
 *  - best ≥ MATCH_THRESHOLD with no runner-up ≥ threshold within AMBIGUITY_GAP → match
 *  - two or more ≥ threshold within the gap → ambiguous (top MAX_CANDIDATES)
 *  - best in [SUGGESTION_THRESHOLD, MATCH_THRESHOLD) → none, with suggestions
 *  - otherwise → none
 */
export function resolveForgetQuery(query: string, facts: Fact[]): ResolutionResult {
  const normalizedQuery = normalizeFactContent(query);
  if (normalizedQuery.length === 0 || facts.length === 0) {
    return { status: "none", suggestions: [] };
  }
  const queryTokens = tokenSet(normalizedQuery);

  const groups = new Map<string, ScoredGroup>();
  for (const fact of facts) {
    const normalized = normalizeFactContent(fact.content);
    if (normalized.length === 0) continue;
    const existing = groups.get(normalized);
    if (existing) {
      existing.ids.push(fact.id);
      existing.newestCreatedAt = Math.max(existing.newestCreatedAt, fact.createdAt.getTime());
    } else {
      const exact = normalized === normalizedQuery;
      groups.set(normalized, {
        content: fact.content,
        normalized,
        ids: [fact.id],
        score: exact ? 1 : diceScore(queryTokens, tokenSet(normalized)),
        exact,
        newestCreatedAt: fact.createdAt.getTime(),
      });
    }
  }

  const ranked = [...groups.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.newestCreatedAt - a.newestCreatedAt ||
      (a.ids[0] < b.ids[0] ? -1 : a.ids[0] > b.ids[0] ? 1 : 0)
  );
  if (ranked.length === 0) return { status: "none", suggestions: [] };

  const strip = ({ content, normalized, ids }: ScoredGroup): FactGroup => ({ content, normalized, ids });
  const best = ranked[0];

  // Exact equality wins outright — two distinct groups can never both be exact.
  if (best.exact) return { status: "match", group: strip(best) };

  if (best.score >= MATCH_THRESHOLD) {
    const rivals = ranked
      .slice(1)
      .filter((g) => g.score >= MATCH_THRESHOLD && best.score - g.score < AMBIGUITY_GAP);
    if (rivals.length > 0) {
      return {
        status: "ambiguous",
        candidates: [best, ...rivals].slice(0, MAX_CANDIDATES).map(strip),
      };
    }
    return { status: "match", group: strip(best) };
  }

  return {
    status: "none",
    suggestions: ranked
      .filter((g) => g.score >= SUGGESTION_THRESHOLD)
      .slice(0, MAX_CANDIDATES)
      .map((g) => g.content),
  };
}
