import { describe, it, expect } from "vitest";
import { describeLongBatch } from "./long-task.js";

const history = (entity: string, days: number) => ({
  name: "get_history",
  args: {
    entity_id: entity,
    start_time: new Date(Date.now() - days * 86400000).toISOString(),
    end_time: new Date().toISOString(),
  },
});

describe("describeLongBatch", () => {
  it("stays silent for a single quick action", () => {
    expect(
      describeLongBatch([{ name: "call_service", args: { domain: "light", service: "turn_off" } }])
    ).toBeNull();
  });

  it("stays silent for a burst of searches", () => {
    expect(
      describeLongBatch(
        ["kitchen", "PM2.5", "presence", "humidity", "incense"].map((q) => ({
          name: "search_entities",
          args: { query: q },
        }))
      )
    ).toBeNull();
  });

  it("stays silent for one sensor over a few hours", () => {
    expect(describeLongBatch([history("sensor.voc", 0.25)])).toBeNull();
  });

  it("speaks up for a week of one sensor", () => {
    expect(describeLongBatch([history("sensor.voc", 7)])).toBe(
      "Give me a moment. I'm reading 7 days of history from one sensor."
    );
  });

  it("speaks up for several sensors even over one day (last night's batch)", () => {
    const text = describeLongBatch([
      history("sensor.pm_2_5mm", 0.5),
      history("sensor.pm_10mm", 0.5),
      history("sensor.nox", 0.5),
      history("sensor.vlaga_2", 0.5),
      history("sensor.temperatura_2", 0.5),
      history("automation.nives_bathroom_fan_on_presence", 0.5),
    ]);
    expect(text).toBe("Give me a moment. I'm reading a day of history from 6 sensors.");
  });

  it("treats an unreadable start time as not long", () => {
    expect(
      describeLongBatch([{ name: "get_history", args: { entity_id: "sensor.voc", start_time: "yesterday" } }])
    ).toBeNull();
  });

  it("defaults a missing end time to now", () => {
    const start = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(
      describeLongBatch([{ name: "get_history", args: { entity_id: "sensor.voc", start_time: start } }])
    ).toMatch(/3 days of history from one sensor/);
  });
});
