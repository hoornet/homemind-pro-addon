import { describe, it, expect } from "vitest";
import {
  readUsage,
  describeUsage,
  spentBudgetOnReasoning,
  type TokenUsage,
} from "./usage.js";

describe("readUsage", () => {
  it("reads the OpenAI shape including reasoning tokens", () => {
    expect(
      readUsage({
        prompt_tokens: 45231,
        completion_tokens: 4096,
        total_tokens: 49327,
        completion_tokens_details: { reasoning_tokens: 3612 },
      })
    ).toEqual({
      promptTokens: 45231,
      completionTokens: 4096,
      reasoningTokens: 3612,
    });
  });

  it("leaves reasoning undefined when the provider does not report it", () => {
    const usage = readUsage({ prompt_tokens: 100, completion_tokens: 20 });
    expect(usage?.reasoningTokens).toBeUndefined();
    expect(usage?.completionTokens).toBe(20);
  });

  it("survives a missing or malformed details object", () => {
    expect(readUsage({ prompt_tokens: 5, completion_tokens_details: null })).toEqual({
      promptTokens: 5,
      completionTokens: undefined,
      reasoningTokens: undefined,
    });
  });

  it("returns undefined when nothing usable is present", () => {
    expect(readUsage(undefined)).toBeUndefined();
    expect(readUsage(null)).toBeUndefined();
    expect(readUsage("nope")).toBeUndefined();
    expect(readUsage({})).toBeUndefined();
    expect(readUsage({ prompt_tokens: "many" })).toBeUndefined();
  });
});

describe("describeUsage", () => {
  it("renders the full breakdown", () => {
    const usage: TokenUsage = {
      promptTokens: 45231,
      completionTokens: 4096,
      reasoningTokens: 3612,
    };
    expect(describeUsage(usage)).toBe("prompt=45231 completion=4096 reasoning=3612");
  });

  it("distinguishes an unreported reasoning count from a zero one", () => {
    expect(describeUsage({ completionTokens: 20 })).toBe(
      "completion=20 reasoning=unreported"
    );
    expect(describeUsage({ completionTokens: 20, reasoningTokens: 0 })).toBe(
      "completion=20 reasoning=0"
    );
  });

  it("says so when there is no usage at all", () => {
    expect(describeUsage(undefined)).toBe("usage=unavailable");
  });
});

describe("spentBudgetOnReasoning", () => {
  it("is true only on a positive reported count", () => {
    expect(spentBudgetOnReasoning({ reasoningTokens: 3612 })).toBe(true);
  });

  it("is false when the count is zero, absent, or the usage is missing", () => {
    // An unreported figure must not be read as evidence of no reasoning: that
    // would hand the user advice aimed at the wrong problem.
    expect(spentBudgetOnReasoning({ reasoningTokens: 0 })).toBe(false);
    expect(spentBudgetOnReasoning({ completionTokens: 500 })).toBe(false);
    expect(spentBudgetOnReasoning(undefined)).toBe(false);
  });
});

describe("cached prompt tokens", () => {
  it("reads OpenAI-style prompt_tokens_details.cached_tokens", () => {
    const usage = readUsage({
      prompt_tokens: 8300,
      completion_tokens: 40,
      prompt_tokens_details: { cached_tokens: 7936 },
    });
    expect(usage?.cachedTokens).toBe(7936);
    expect(describeUsage(usage)).toContain("cached=7936");
  });

  it("reads Anthropic-style cache_read_input_tokens", () => {
    const usage = readUsage({ input_tokens: 1200, output_tokens: 40, cache_read_input_tokens: 1024 });
    expect(usage?.cachedTokens).toBe(1024);
  });

  it("says nothing about the cache when the provider did not report it", () => {
    const usage = readUsage({ prompt_tokens: 100, completion_tokens: 5 });
    expect(usage?.cachedTokens).toBeUndefined();
    expect(describeUsage(usage)).not.toContain("cached=");
  });
});
