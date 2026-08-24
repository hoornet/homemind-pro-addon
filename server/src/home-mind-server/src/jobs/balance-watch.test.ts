import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BalanceWatchJob,
  computeBalanceState,
  estimateDaysLeft,
  daysLeftText,
  type BalanceWatchOptions,
  type KeyInfo,
} from "./balance-watch.js";

function keyInfo(overrides: Partial<KeyInfo> = {}): KeyInfo {
  return {
    limit: 6.5,
    limit_remaining: 5,
    limit_reset: null,
    usage_weekly: 0,
    usage_monthly: 0,
    ...overrides,
  };
}

describe("estimateDaysLeft", () => {
  it("uses the weekly window when present", () => {
    expect(estimateDaysLeft(keyInfo({ limit_remaining: 7, usage_weekly: 7 }))).toBe(7);
  });

  it("falls back to the monthly window", () => {
    expect(estimateDaysLeft(keyInfo({ limit_remaining: 3, usage_monthly: 30 }))).toBe(3);
  });

  it("assumes the default burn with no history", () => {
    // $1.50 remaining at $0.15/day default
    expect(estimateDaysLeft(keyInfo({ limit_remaining: 1.5 }))).toBe(10);
  });

  it("weekly beats monthly", () => {
    expect(
      estimateDaysLeft(keyInfo({ limit_remaining: 7, usage_weekly: 7, usage_monthly: 300 }))
    ).toBe(7);
  });
});

describe("computeBalanceState", () => {
  it("is ok with plenty left", () => {
    expect(computeBalanceState(keyInfo({ limit_remaining: 5, usage_weekly: 3.5 }))).toBe("ok");
  });

  it("warns at three days", () => {
    // $1.50 at $0.50/day = 3 days
    expect(computeBalanceState(keyInfo({ limit_remaining: 1.5, usage_weekly: 3.5 }))).toBe(
      "warned"
    );
  });

  it("pauses at one day", () => {
    expect(computeBalanceState(keyInfo({ limit_remaining: 0.5, usage_weekly: 3.5 }))).toBe(
      "paused"
    );
  });

  it("pauses at the empty floor regardless of pace", () => {
    // Featherweight usage would estimate months left — but $0.04 is gone.
    expect(
      computeBalanceState(keyInfo({ limit_remaining: 0.04, usage_weekly: 0.01 }))
    ).toBe("paused");
  });
});

describe("daysLeftText", () => {
  it("rounds to whole days", () => {
    expect(daysLeftText(2.7)).toBe("about 3 days");
  });
  it("says a day near one", () => {
    expect(daysLeftText(1.2)).toBe("about a day");
  });
});

describe("BalanceWatchJob.runOnce", () => {
  let statePath: string;
  let ha: { callService: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    statePath = join(mkdtempSync(join(tmpdir(), "balance-")), "state");
    ha = { callService: vi.fn().mockResolvedValue([]) };
  });

  function job(info: Partial<KeyInfo> | null, opts: { enabled?: boolean } = {}) {
    const fetchImpl = vi.fn().mockResolvedValue(
      info === null
        ? { ok: false, status: 401, json: async () => ({}) }
        : { ok: true, json: async () => ({ data: keyInfo(info) }) }
    );
    return {
      job: new BalanceWatchJob({
        enabled: opts.enabled ?? true,
        apiKey: "test-key",
        baseUrl: "https://example.invalid/api/v1",
        ha: ha as unknown as BalanceWatchOptions["ha"],
        statePath,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      fetchImpl,
    };
  }

  it("does nothing when disabled", async () => {
    const { job: j, fetchImpl } = job(keyInfo(), { enabled: false });
    await j.runOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(ha.callService).not.toHaveBeenCalled();
  });

  it("asks the key endpoint of the configured base URL", async () => {
    const { job: j, fetchImpl } = job({ limit_remaining: 5, usage_weekly: 0.7 });
    await j.runOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.invalid/api/v1/key",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-key" },
      })
    );
  });

  it("skips keys with a scheduled reset", async () => {
    const { job: j } = job({ limit_reset: "monthly", limit_remaining: 0.01 });
    await j.runOnce();
    expect(ha.callService).not.toHaveBeenCalled();
  });

  it("skips unlimited keys", async () => {
    const { job: j } = job({ limit: null, limit_remaining: null });
    await j.runOnce();
    expect(ha.callService).not.toHaveBeenCalled();
  });

  it("stays quiet while ok", async () => {
    const { job: j } = job({ limit_remaining: 5, usage_weekly: 0.7 }); // 50 days
    await j.runOnce();
    expect(ha.callService).not.toHaveBeenCalled();
  });

  it("notifies once on ok -> warned, then stays quiet", async () => {
    const { job: j } = job({ limit_remaining: 1.5, usage_weekly: 3.5 }); // 3 days
    await j.runOnce();
    const creates = ha.callService.mock.calls.filter((c) => c[1] === "create");
    expect(creates).toHaveLength(1);
    expect(creates[0][3]).toMatchObject({ notification_id: "nives_low_balance" });
    expect(creates[0][3].message).toContain("About 3 days");
    expect(creates[0][3].message).toContain("nives.house");
    expect(readFileSync(statePath, "utf8")).toBe("warned");

    ha.callService.mockClear();
    await j.runOnce();
    expect(ha.callService).not.toHaveBeenCalled();
  });

  it("moves warned -> paused, swapping notifications", async () => {
    writeFileSync(statePath, "warned");
    const { job: j } = job({ limit_remaining: 0.3, usage_weekly: 3.5 }); // 0.6 days
    await j.runOnce();
    const calls = ha.callService.mock.calls;
    expect(calls.some((c) => c[1] === "dismiss" && c[3].notification_id === "nives_low_balance")).toBe(true);
    const creates = calls.filter((c) => c[1] === "create");
    expect(creates).toHaveLength(1);
    expect(creates[0][3]).toMatchObject({ notification_id: "nives_balance_paused" });
    expect(readFileSync(statePath, "utf8")).toBe("paused");
  });

  it("dismisses everything on a top-up (paused -> ok)", async () => {
    writeFileSync(statePath, "paused");
    const { job: j } = job({ limit_remaining: 6.5, usage_weekly: 0.7 });
    await j.runOnce();
    const dismissed = ha.callService.mock.calls
      .filter((c) => c[1] === "dismiss")
      .map((c) => c[3].notification_id);
    expect(dismissed).toEqual(
      expect.arrayContaining(["nives_low_balance", "nives_balance_paused"])
    );
    expect(ha.callService.mock.calls.filter((c) => c[1] === "create")).toHaveLength(0);
    expect(readFileSync(statePath, "utf8")).toBe("ok");
  });

  it("keeps the latch when the key endpoint is unreachable", async () => {
    writeFileSync(statePath, "warned");
    const { job: j } = job(null);
    await j.runOnce();
    expect(ha.callService).not.toHaveBeenCalled();
    expect(readFileSync(statePath, "utf8")).toBe("warned");
  });

  it("retries the transition next poll when HA is unreachable", async () => {
    ha.callService.mockRejectedValue(new Error("HA down"));
    const { job: j } = job({ limit_remaining: 1.5, usage_weekly: 3.5 });
    await expect(j.runOnce()).rejects.toThrow("HA down");
    // Latch untouched -> the warned transition fires again next poll.
    expect(existsSync(statePath)).toBe(false);
  });
});
