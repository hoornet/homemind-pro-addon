import { describe, it, expect } from "vitest";
import { describePersonaSource } from "./routes.js";

describe("describePersonaSource", () => {
  // nives#54: a user set the add-on's Custom Prompt correctly and nothing
  // happened, because the integration was also sending one and silently won.
  // Since 2.4.23 the integration's duplicate persona field is gone; requests
  // carrying a customPrompt now come from the AI Task entity or API clients,
  // and the add-on's Configuration tab is the one user-facing field.
  const HAL = "You are HAL 9000, the calm and precise computer from 2001: A Space Odyssey.";

  it("names the built-in default when nothing is set", () => {
    expect(describePersonaSource(undefined, undefined)).toMatch(/built-in default/i);
  });

  it("names the add-on config when only that is set", () => {
    const line = describePersonaSource(undefined, HAL);
    expect(line).toMatch(/add-on configuration/i);
    expect(line).toContain("You are HAL 9000");
  });

  it("names the request when only that carries a prompt", () => {
    const line = describePersonaSource(HAL, undefined);
    expect(line).toMatch(/sent with the request/i);
  });

  it("WARNS that the add-on's prompt is overridden when both are set", () => {
    const line = describePersonaSource("You are Ava.", HAL);
    expect(line).toMatch(/sent with the request/i);
    expect(line).toMatch(/overridden/i);
    expect(line).toContain("You are Ava.");
    // The losing value must not be shown as if it were in effect.
    expect(line).not.toContain("HAL 9000");
  });

  it("treats whitespace-only as unset", () => {
    expect(describePersonaSource("   ", undefined)).toMatch(/built-in default/i);
    expect(describePersonaSource("   ", HAL)).toMatch(/add-on configuration/i);
  });

  it("truncates a long prompt instead of dumping it", () => {
    const long = "You are a very thorough assistant. ".repeat(20);
    const line = describePersonaSource(long, undefined);
    expect(line.length).toBeLessThan(160);
    expect(line).toContain("…");
  });
});
