import { describe, it, expect } from "vitest";
import {
  normalizeFactContent,
  resolveForgetQuery,
  MATCH_THRESHOLD,
  SUGGESTION_THRESHOLD,
  FORGET_FILTER_THRESHOLD,
  contentSimilarity,
  looksLikeRelearn,
} from "./fact-resolution.js";
import type { Fact } from "./types.js";

function makeFact(id: string, content: string, createdAt = "2026-01-01T00:00:00Z"): Fact {
  return {
    id,
    userId: "user-1",
    content,
    category: "preference",
    confidence: 1,
    createdAt: new Date(createdAt),
    lastUsed: new Date(createdAt),
    useCount: 0,
  };
}

describe("normalizeFactContent", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeFactContent("  User's  name is —  Alex!  ")).toBe("user s name is alex");
  });

  it("preserves Unicode letters and diacritics", () => {
    expect(normalizeFactContent("Otroška soba je Živina soba")).toBe("otroška soba je živina soba");
  });

  it("keeps numbers", () => {
    expect(normalizeFactContent("prefers 21°C at night")).toBe("prefers 21 c at night");
  });
});

describe("resolveForgetQuery", () => {
  const canaryWord = makeFact("f-word", "User's test canary word is bumblebee");
  const canaryColor = makeFact("f-color", "User's test canary color is purple");
  const temperature = makeFact("f-temp", "User prefers bedroom temperature at 20°C");

  it("matches on exact content", () => {
    const result = resolveForgetQuery("User's test canary word is bumblebee", [
      canaryWord,
      canaryColor,
      temperature,
    ]);
    expect(result.status).toBe("match");
    if (result.status === "match") {
      expect(result.group.ids).toEqual(["f-word"]);
      expect(result.group.content).toBe("User's test canary word is bumblebee");
    }
  });

  it("matches despite case, punctuation, and whitespace differences", () => {
    const result = resolveForgetQuery("users  test CANARY word is bumblebee!!", [
      canaryWord,
      canaryColor,
    ]);
    // Not string-exact but token-identical → still resolves to the word fact alone.
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.group.ids).toEqual(["f-word"]);
  });

  it("exact equality wins outright even with a near-duplicate present", () => {
    const nearDupe = makeFact("f-dupe", "User's test canary word is a bumblebee");
    const result = resolveForgetQuery("User's test canary word is bumblebee", [
      canaryWord,
      nearDupe,
    ]);
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.group.ids).toEqual(["f-word"]);
  });

  it("matches a paraphrase above the threshold", () => {
    // "my name is Jure" vs stored "User's name is Jure": Dice = 2·3/(4+5) ≈ 0.67
    const name = makeFact("f-name", "User's name is Jure");
    const result = resolveForgetQuery("my name is Jure", [name, temperature]);
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.group.ids).toEqual(["f-name"]);
  });

  it("returns ambiguous when two facts score close and above threshold", () => {
    const bedroom = makeFact("f-bed", "User prefers the bedroom at 20 degrees");
    const bathroom = makeFact("f-bath", "User prefers the bathroom at 20 degrees");
    const result = resolveForgetQuery("user prefers at 20 degrees", [bedroom, bathroom]);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.map((c) => c.ids[0]).sort()).toEqual(["f-bath", "f-bed"]);
    }
  });

  it("matches when the best clearly outscores the runner-up", () => {
    const result = resolveForgetQuery("test canary word is bumblebee", [
      canaryWord,
      temperature,
    ]);
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.group.ids).toEqual(["f-word"]);
  });

  it("returns none with suggestions in the near-miss band", () => {
    // {forget, my, test, canary, thing} vs {user, s, test, canary, word, is, bumblebee}:
    // Dice = 2·2/(5+7) ≈ 0.33… so add one shared token to land in [0.35, 0.6)
    const result = resolveForgetQuery("my test canary word thing", [canaryWord, temperature]);
    expect(result.status).toBe("none");
    if (result.status === "none") {
      expect(result.suggestions).toContain("User's test canary word is bumblebee");
    }
  });

  it("returns none without suggestions when nothing comes close", () => {
    const result = resolveForgetQuery("the weather in Ljubljana", [canaryWord, temperature]);
    expect(result.status).toBe("none");
    if (result.status === "none") expect(result.suggestions).toEqual([]);
  });

  it("groups duplicate contents into one candidate carrying all ids", () => {
    const dupe1 = makeFact("f-1", "User's name is Jure");
    const dupe2 = makeFact("f-2", "user's name is jure  ");
    const result = resolveForgetQuery("User's name is Jure", [dupe1, dupe2, temperature]);
    expect(result.status).toBe("match");
    if (result.status === "match") {
      expect(result.group.ids.sort()).toEqual(["f-1", "f-2"]);
    }
  });

  it("orders ambiguous candidates deterministically (newest first on ties)", () => {
    const older = makeFact("f-old", "User prefers the bedroom at 20 degrees", "2026-01-01T00:00:00Z");
    const newer = makeFact("f-new", "User prefers the bathroom at 20 degrees", "2026-02-01T00:00:00Z");
    const result = resolveForgetQuery("user prefers at 20 degrees", [older, newer]);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.map((c) => c.ids[0])).toEqual(["f-new", "f-old"]);
    }
  });

  it("returns none for an empty query or empty fact list", () => {
    expect(resolveForgetQuery("", [canaryWord]).status).toBe("none");
    expect(resolveForgetQuery("anything", []).status).toBe("none");
    expect(resolveForgetQuery("  !?  ", [canaryWord]).status).toBe("none");
  });

  it("exports sane threshold constants", () => {
    expect(MATCH_THRESHOLD).toBeGreaterThan(SUGGESTION_THRESHOLD);
  });
});

describe("contentSimilarity (extraction filter)", () => {
  it("scores a verbatim re-learn at 1", () => {
    expect(contentSimilarity("User's name is Jure", "user s name is jure")).toBe(1);
  });

  it("puts a REPLACEMENT below the filter threshold — it must survive extraction", () => {
    // The issue #54 shape: same frame, different value. If this were filtered,
    // "forget I'm Jure, I'm HAL 9000 now" would forget the old name and never
    // learn the new one.
    const score = contentSimilarity("User's name is HAL 9000", "User's name is Jure");
    expect(score).toBeLessThan(FORGET_FILTER_THRESHOLD);
  });

  it("puts a REWORDED re-learn above the filter threshold — it must be dropped", () => {
    expect(
      contentSimilarity("The user's name is Jure", "User's name is Jure")
    ).toBeGreaterThanOrEqual(FORGET_FILTER_THRESHOLD);
    expect(
      contentSimilarity("The user's canary word is bumblebee", "User's test canary word is bumblebee")
    ).toBeGreaterThanOrEqual(FORGET_FILTER_THRESHOLD);
  });

  it("scores unrelated facts near zero", () => {
    expect(contentSimilarity("User prefers 20 degrees", "User's name is Jure")).toBeLessThan(0.3);
  });

  it("is symmetric and safe on empty input", () => {
    expect(contentSimilarity("a b c", "c b a")).toBe(contentSimilarity("c b a", "a b c"));
    expect(contentSimilarity("", "User's name is Jure")).toBe(0);
  });
});

describe("looksLikeRelearn (what the extraction filter actually asks)", () => {
  const CANARY = 'User\'s test canary word is "bumblebee"';

  it("does NOT flag a one-word value swap — the live 2.4.16 regression", () => {
    // Shipped bug: this scores 0.857, over the 0.85 threshold, so the user's
    // brand new canary word was dropped and the replacement silently lost.
    expect(looksLikeRelearn('User\'s test canary word is "honeybee"', CANARY)).toBe(false);
  });

  it("flags a reworded restatement that scores IDENTICALLY (0.857)", () => {
    // Same similarity as the case above — which is why similarity alone can
    // never separate them, and why the token-change rule exists.
    expect(looksLikeRelearn("The user's canary word is bumblebee", CANARY)).toBe(true);
  });

  it("flags a verbatim re-learn", () => {
    expect(looksLikeRelearn(CANARY, CANARY)).toBe(true);
  });

  it("does NOT flag a multi-token replacement (the name case)", () => {
    expect(looksLikeRelearn("User's name is HAL 9000", "User's name is Jure")).toBe(false);
  });

  it("does NOT flag an unrelated fact", () => {
    expect(looksLikeRelearn("User prefers the bedroom at 20 degrees", CANARY)).toBe(false);
  });

  it("flags a restatement that only drops a word", () => {
    expect(looksLikeRelearn("User's canary word is bumblebee", CANARY)).toBe(true);
  });

  it("flags a restatement that still asserts the forgotten value", () => {
    expect(looksLikeRelearn('User\'s test canary word is "bumblebee" and "honeybee"', CANARY)).toBe(true);
  });
});
