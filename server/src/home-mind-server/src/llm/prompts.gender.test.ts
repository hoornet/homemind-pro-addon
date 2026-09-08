import { describe, it, expect } from "vitest";
import { genderPointer, buildSystemPromptText } from "./prompts.js";

// Measured before this existed (2026-09-08, the served model, 4 samples per arm):
// the default persona already writes feminine Slovene unprompted, because
// "Nives" is a feminine name. The defect is disagreement — a male voice under
// that persona still produced "Ugasnila sem", a woman's grammar in a man's
// voice. With the pointer, all four samples flipped, and a HAL 9000 persona
// under a female voice flipped the other way just as reliably.

describe("genderPointer", () => {
  it("says nothing when no voice is configured", () => {
    // Text-only setups must not pay for this, and the default persona is
    // already correct without help.
    expect(genderPointer(undefined)).toBe("");
  });

  it("names the right forms for a male voice", () => {
    const p = genderPointer("male");
    expect(p).toContain('"Ugasnil sem"');
    expect(p).toMatch(/NEVER "Ugasnila sem"/);
  });

  it("names the right forms for a female voice", () => {
    const p = genderPointer("female");
    expect(p).toContain('"Ugasnila sem"');
    expect(p).toMatch(/NEVER "Ugasnil sem"/);
  });

  it("covers the language family, not just Slovene", () => {
    // Every one of these inflects the first person for the speaker's gender,
    // so a Slovene-only instruction would leave those users with the same bug.
    const p = genderPointer("female");
    for (const lang of ["Croatian", "Czech", "Polish", "Russian", "Hebrew", "Arabic"]) {
      expect(p).toContain(lang);
    }
  });

  it("constrains itself to the assistant's own speech", () => {
    // Without this the model starts gendering the user too.
    expect(genderPointer("male")).toMatch(/first-person statements only/);
  });
});

describe("the pointer in an assembled prompt", () => {
  it("is absent unless a voice is configured", () => {
    const text = buildSystemPromptText([], false, undefined, undefined, undefined, "sl");
    expect(text).not.toMatch(/Ugasnil/);
  });

  it("follows a custom persona, so the voice wins over the persona's gender", () => {
    const hal = "You are HAL 9000, the calm and precise computer.";
    const text = buildSystemPromptText([], true, hal, undefined, undefined, "sl", "female");
    expect(text).toContain(hal);
    expect(text.indexOf("Ugasnila sem")).toBeGreaterThan(text.indexOf(hal));
  });

  it("applies to written replies too, not only spoken ones", () => {
    // The reply is written first and spoken second; gendering only the voice
    // path would leave the Assist transcript disagreeing with the audio.
    const text = buildSystemPromptText([], false, undefined, undefined, undefined, "sl", "male");
    expect(text).toContain('"Ugasnil sem"');
  });
});
