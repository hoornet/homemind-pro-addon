import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildSystemPromptText } from "./prompts.js";

type TextBlock = Anthropic.TextBlockParam;

describe("buildSystemPrompt (Anthropic)", () => {
  it("returns 2 blocks with default identity when no custom prompt", () => {
    const blocks = buildSystemPrompt(["fact1"]) as TextBlock[];

    expect(blocks).toHaveLength(2);
    // Static block: default identity + instructions, cached
    expect(blocks[0]).toMatchObject({
      type: "text",
      cache_control: { type: "ephemeral" },
    });
    expect(blocks[0].text).toContain("You are Nives, a helpful smart home assistant");
    expect(blocks[0].text).toContain("## WHEN TO USE TOOLS");
    // Dynamic block has no cache_control
    expect(blocks[1]).toMatchObject({ type: "text" });
    expect(blocks[1]).not.toHaveProperty("cache_control");
    expect(blocks[1].text).toContain("fact1");
  });

  it("replaces default identity with custom prompt", () => {
    const blocks = buildSystemPrompt(["fact1"], false, "You are Ava.") as TextBlock[];

    expect(blocks).toHaveLength(2);
    // Custom prompt is the identity, followed by instructions
    expect(blocks[0].text).toMatch(/^You are Ava\./);
    expect(blocks[0].text).toContain("## WHEN TO USE TOOLS");
    expect(blocks[0].text).not.toContain("You are Nives, a helpful smart home assistant");
    expect(blocks[0]).toHaveProperty("cache_control", { type: "ephemeral" });
    // Dynamic block
    expect(blocks[1].text).toContain("fact1");
  });

  it("uses voice instructions when isVoice is true", () => {
    const blocks = buildSystemPrompt([], true) as TextBlock[];

    expect(blocks[0].text).toContain("You are Nives, a helpful smart home voice assistant");
    expect(blocks[0].text).toContain("Keep responses under 2-3 sentences");
  });

  it("uses voice instructions with custom prompt", () => {
    const blocks = buildSystemPrompt([], true, "You are Ava.") as TextBlock[];

    expect(blocks[0].text).toMatch(/^You are Ava\./);
    expect(blocks[0].text).toContain("Keep responses under 2-3 sentences");
    expect(blocks[0].text).not.toContain("You are Nives, a helpful smart home voice assistant");
  });

  it("shows 'No memories yet.' when facts are empty", () => {
    const blocks = buildSystemPrompt([]) as TextBlock[];

    const dynamicBlock = blocks[blocks.length - 1];
    expect(dynamicBlock.text).toContain("No memories yet.");
  });
});

describe("buildSystemPromptText (OpenAI)", () => {
  it("returns text with default identity when no custom prompt", () => {
    const text = buildSystemPromptText(["my fact"]);

    expect(text).toContain("You are Nives, a helpful smart home assistant");
    expect(text).toContain("## WHEN TO USE TOOLS");
    expect(text).toContain("my fact");
  });

  it("replaces default identity with custom prompt", () => {
    const text = buildSystemPromptText(["my fact"], false, "You are Ava, sarcastic and sharp.");

    expect(text).toMatch(/^You are Ava, sarcastic and sharp\./);
    expect(text).not.toContain("You are Nives, a helpful smart home assistant");
    expect(text).toContain("## WHEN TO USE TOOLS");
    expect(text).toContain("my fact");

    // Custom prompt should appear before instructions and dynamic context
    const customIdx = text.indexOf("You are Ava");
    const toolsIdx = text.indexOf("## WHEN TO USE TOOLS");
    const contextIdx = text.indexOf("## Current Context:");

    expect(customIdx).toBeLessThan(toolsIdx);
    expect(toolsIdx).toBeLessThan(contextIdx);
  });

  it("uses voice identity and instructions when isVoice is true", () => {
    const text = buildSystemPromptText([], true);

    expect(text).toContain("You are Nives, a helpful smart home voice assistant");
    expect(text).toContain("Keep responses under 2-3 sentences");
  });

  it("shows 'No memories yet.' when facts are empty", () => {
    const text = buildSystemPromptText([]);

    expect(text).toContain("No memories yet.");
  });
});

describe("interface-language tie-breaker line", () => {
  it("appears in the dynamic block when a language is passed", async () => {
    const { buildSystemPromptText } = await import("./prompts.js");
    const prompt = buildSystemPromptText([], false, undefined, undefined, undefined, "sl");
    expect(prompt).toContain("Interface language: sl");
    expect(prompt).toContain("ONLY when the user's own words");
  });

  it("is absent when no language is passed", async () => {
    const { buildSystemPromptText } = await import("./prompts.js");
    expect(buildSystemPromptText([])).not.toContain("Interface language");
  });
});

describe("FORGETTING MEMORIES section", () => {
  it("is present in the regular prompt with the confirm-first flow", () => {
    const text = buildSystemPromptText(["User's name is Alex"]);
    expect(text).toContain("## FORGETTING MEMORIES (CONFIRM FIRST)");
    expect(text).toContain("forget_memory");
    expect(text).toMatch(/never paraphrased and never translated|never paraphrase or translate/);
    // The reminder trap must be named explicitly.
    expect(text).toMatch(/Don't forget to X|DON'T forget X/);
  });

  it("is present in the voice prompt", () => {
    const text = buildSystemPromptText([], true);
    expect(text).toContain("## FORGETTING MEMORIES (CONFIRM FIRST)");
    expect(text).toContain("forget_memory");
  });

  it("is present in both Anthropic prompt variants", () => {
    const regular = buildSystemPrompt([]) as { text: string }[];
    const voice = buildSystemPrompt([], true) as { text: string }[];
    expect(regular.map((b) => b.text).join("\n")).toContain("## FORGETTING MEMORIES (CONFIRM FIRST)");
    expect(voice.map((b) => b.text).join("\n")).toContain("## FORGETTING MEMORIES (CONFIRM FIRST)");
  });

  it("lists forgetting in the capabilities section", () => {
    const text = buildSystemPromptText([]);
    expect(text).toContain("Forget a remembered fact when asked");
  });
});

describe("assistant identity", () => {
  // nives#54: the name was never stated, so a model asked "what is your name?"
  // inferred it from the "Nives: " automation prefix — and a custom persona had
  // to out-shout that convention instead of replacing a stated name.
  it("names Nives explicitly in both default variants", () => {
    expect(buildSystemPromptText([])).toMatch(/^You are Nives, a helpful smart home assistant/);
    expect(buildSystemPromptText([], true)).toMatch(/^You are Nives, a helpful smart home voice assistant/);
  });

  it("a custom prompt replaces the name entirely — no stated Nives identity survives", () => {
    const text = buildSystemPromptText([], false, "You are HAL 9000, calm and precise.");
    expect(text).toMatch(/^You are HAL 9000, calm and precise\./);
    expect(text).not.toContain("You are Nives");
  });

  it("tells the model the automation prefix is a label, not its name", () => {
    for (const voice of [false, true]) {
      const text = buildSystemPromptText([], voice);
      expect(text).toMatch(/(never|not) your name/i);
    }
  });

  it("keeps the naming clarification when a custom persona is set", () => {
    // This is the case that matters: the clarification lives in the shared
    // instructions, so it must survive the identity line being replaced.
    const text = buildSystemPromptText([], false, "You are HAL 9000.");
    expect(text).toMatch(/(never|not) your name/i);
    expect(text).toContain("HAL 9000");
  });
});
