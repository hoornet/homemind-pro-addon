import { describe, it, expect, beforeEach } from "vitest";
import {
  recordPreview,
  isConfirmed,
  clearConfirmation,
  describePending,
  previewNotes,
} from "./automation-confirmations.js";

describe("automation confirmations", () => {
  const conv = "conv-1";
  const create = (over: Record<string, unknown> = {}) => ({
    alias: "X",
    trigger: { platform: "time", at: "12:00:00" },
    action: { service: "notify.foo" },
    ...over,
  });

  beforeEach(() => clearConfirmation(conv));

  it("confirms a create in a LATER turn after a recorded preview", () => {
    recordPreview(conv, "create_automation", create(), "turn-1");
    expect(isConfirmed(conv, "create_automation", create(), "turn-2")).toBe(true);
  });

  it("does NOT confirm in the same turn the preview was recorded", () => {
    recordPreview(conv, "create_automation", create(), "turn-1");
    expect(isConfirmed(conv, "create_automation", create(), "turn-1")).toBe(false);
  });

  it("does NOT confirm without a prior preview", () => {
    expect(isConfirmed(conv, "create_automation", create(), "turn-2")).toBe(false);
  });

  it("confirms a create even when the payload was reformatted (payload not compared)", () => {
    // Preview with action as an array; confirm with a wildly different shape.
    recordPreview(conv, "create_automation", { alias: "X", trigger: [{ platform: "time", at: "12:00:00" }], action: [{ service: "notify.foo" }] }, "turn-1");
    const reformatted = {
      alias: "Nives: X",
      action: { service: "foo", domain: "notify", service_data: { message: "hi" } },
      trigger: { at: "12:00:00", platform: "time" },
    };
    expect(isConfirmed(conv, "create_automation", reformatted, "turn-2")).toBe(true);
  });

  it("is single-use — confirming consumes the preview", () => {
    recordPreview(conv, "create_automation", create(), "turn-1");
    expect(isConfirmed(conv, "create_automation", create(), "turn-2")).toBe(true);
    expect(isConfirmed(conv, "create_automation", create(), "turn-3")).toBe(false);
  });

  it("does NOT confirm a create for a DIFFERENT automation than the one previewed", () => {
    // Regression: create had no identity key, so any create in a later turn
    // confirmed any earlier create preview. "Porch light at sunset?" → preview →
    // "no, forget it, turn the heating off at 11pm instead" used to commit the
    // heating automation without ever asking.
    recordPreview(conv, "create_automation", create({ alias: "Porch light at sunset" }), "turn-1");
    expect(
      isConfirmed(conv, "create_automation", create({ alias: "Heating off at 11pm" }), "turn-2")
    ).toBe(false);
  });

  it("confirms a create whose alias only differs by the auto prefix or casing", () => {
    recordPreview(conv, "create_automation", create({ alias: "Porch light at sunset" }), "turn-1");
    expect(
      isConfirmed(conv, "create_automation", create({ alias: "Nives: porch light at sunset" }), "turn-2")
    ).toBe(true);
  });

  it("does not confirm across different tools", () => {
    recordPreview(conv, "create_automation", create(), "turn-1");
    expect(isConfirmed(conv, "delete_automation", { entity_id: "automation.x" }, "turn-2")).toBe(false);
  });

  it("scopes delete/update by entity_id — a different target does NOT confirm", () => {
    recordPreview(conv, "delete_automation", { entity_id: "automation.x" }, "turn-1");
    expect(isConfirmed(conv, "delete_automation", { entity_id: "automation.y" }, "turn-2")).toBe(false);
    expect(isConfirmed(conv, "delete_automation", { entity_id: "automation.x" }, "turn-2")).toBe(true);
  });

  it("describePending summarizes create/update/delete", () => {
    expect(
      describePending("create_automation", { alias: "A", trigger: {}, action: {} })
    ).toMatchObject({ action: "create automation", alias: "A" });
    expect(describePending("update_automation", { entity_id: "automation.x", mode: "restart" })).toMatchObject({
      action: "update automation",
      entity_id: "automation.x",
      changes: { mode: "restart" },
    });
    expect(describePending("delete_automation", { entity_id: "automation.x" })).toMatchObject({
      action: "delete automation",
      entity_id: "automation.x",
    });
  });
});

describe("preview notes — surfacing what the payload does NOT do", () => {
  // Reproduces the real session that motivated this: the user asked for cooling
  // "when I'm at home", between 20:00 and 22:00, switching off again at 20C.
  // What got built was a bare 20:00 trigger with one numeric_state condition,
  // and the model described a 20:00-22:00 check that was never written.
  const bedroomAsBuilt = {
    alias: "Bedroom cooling at 20:00 if over 22C",
    trigger: { platform: "time", at: "20:00:00" },
    condition: { condition: "numeric_state", entity_id: "sensor.temperatura_2", above: 22 },
    action: { service: "climate.set_temperature" },
  };

  it("warns that a time-only trigger checks the value once and never again", () => {
    const notes = previewNotes(bedroomAsBuilt);
    expect(notes.some((n) => /checked once/i.test(n))).toBe(true);
    expect(notes.some((n) => /numeric_state trigger has to be added/i.test(n))).toBe(true);
  });

  it("warns loudly when there are no conditions at all", () => {
    const notes = previewNotes({ ...bedroomAsBuilt, condition: undefined });
    expect(notes.some((n) => /NO conditions/.test(n))).toBe(true);
    expect(notes.some((n) => /who is home/i.test(n))).toBe(true);
  });

  it("stays quiet when the automation genuinely covers the window", () => {
    const notes = previewNotes({
      alias: "Bedroom cooling 20:00-22:00",
      trigger: [
        { trigger: "time", at: "20:00:00" },
        { trigger: "numeric_state", entity_id: "sensor.temperatura_2", above: 22 },
      ],
      condition: [
        { condition: "time", after: "20:00:00", before: "22:00:00" },
        { condition: "state", entity_id: "person.jure", state: "home" },
        { condition: "numeric_state", entity_id: "sensor.temperatura_2", above: 22 },
      ],
      action: { service: "climate.set_temperature" },
    });
    expect(notes).toEqual([]);
  });

  it("reads both the legacy platform: key and the current trigger: key", () => {
    const legacy = previewNotes(bedroomAsBuilt);
    const current = previewNotes({
      ...bedroomAsBuilt,
      trigger: { trigger: "time", at: "20:00:00" },
    });
    expect(current).toEqual(legacy);
  });

  it("does not warn about a time trigger when no numeric check is involved", () => {
    expect(
      previewNotes({
        alias: "Porch light",
        trigger: { platform: "time", at: "20:00:00" },
        condition: { condition: "state", entity_id: "person.jure", state: "home" },
        action: { service: "light.turn_on" },
      })
    ).toEqual([]);
  });

  it("makes an absent condition explicit in the preview rather than omitting the key", () => {
    const preview = describePending("create_automation", {
      alias: "X",
      trigger: { platform: "time", at: "12:00:00" },
      action: { service: "light.turn_on" },
    });
    expect(preview.condition).toBe("(none — runs unconditionally)");
    expect((preview.notes as string[]).length).toBeGreaterThan(0);
  });

  it("carries the notes through describePending for the real failing payload", () => {
    const preview = describePending("create_automation", bedroomAsBuilt);
    expect((preview.notes as string[]).some((n) => /checked once/i.test(n))).toBe(true);
  });
});

describe("several pending previews at once (an on/off pair)", () => {
  const conv = "conv-pair";
  const on = {
    alias: "Bedroom cooling at 20:00-22:00 if over 22C",
    trigger: { platform: "numeric_state", entity_id: "sensor.temperatura_2", above: 22 },
    action: { service: "climate.set_temperature" },
  };
  const off = {
    alias: "Bedroom cooling stop when 20C",
    trigger: { platform: "numeric_state", entity_id: "sensor.temperatura_2", below: 20 },
    action: { service: "climate.turn_off" },
  };

  beforeEach(() => clearConfirmation(conv));

  it("confirms BOTH halves after one yes — the loop that created nothing", () => {
    // Live failure: "on above 22, off below 20" previewed both in one turn, then
    // looped forever. A single slot per conversation meant the second preview
    // overwrote the first, so each create found the OTHER automation pending,
    // mismatched, and re-previewed — five rounds of "shall I create these?" and
    // an empty automations.yaml.
    recordPreview(conv, "create_automation", on, "turn-1");
    recordPreview(conv, "create_automation", off, "turn-1");

    expect(isConfirmed(conv, "create_automation", on, "turn-2")).toBe(true);
    expect(isConfirmed(conv, "create_automation", off, "turn-2")).toBe(true);
  });

  it("still refuses to confirm in the same turn the preview was recorded", () => {
    recordPreview(conv, "create_automation", on, "turn-1");
    recordPreview(conv, "create_automation", off, "turn-1");
    expect(isConfirmed(conv, "create_automation", on, "turn-1")).toBe(false);
    expect(isConfirmed(conv, "create_automation", off, "turn-1")).toBe(false);
  });

  it("each half is single-use", () => {
    recordPreview(conv, "create_automation", on, "turn-1");
    expect(isConfirmed(conv, "create_automation", on, "turn-2")).toBe(true);
    expect(isConfirmed(conv, "create_automation", on, "turn-3")).toBe(false);
  });

  it("a third, unrelated automation is still not confirmed by either", () => {
    recordPreview(conv, "create_automation", on, "turn-1");
    recordPreview(conv, "create_automation", off, "turn-1");
    expect(
      isConfirmed(conv, "create_automation", { ...on, alias: "Something else entirely" }, "turn-2")
    ).toBe(false);
  });

  it("clearConfirmation drops every pending preview for the conversation", () => {
    recordPreview(conv, "create_automation", on, "turn-1");
    recordPreview(conv, "create_automation", off, "turn-1");
    clearConfirmation(conv);
    expect(isConfirmed(conv, "create_automation", on, "turn-2")).toBe(false);
    expect(isConfirmed(conv, "create_automation", off, "turn-2")).toBe(false);
  });

  it("does not leak across conversations", () => {
    recordPreview(conv, "create_automation", on, "turn-1");
    expect(isConfirmed("other-conv", "create_automation", on, "turn-2")).toBe(false);
    expect(isConfirmed(conv, "create_automation", on, "turn-2")).toBe(true);
  });
});
