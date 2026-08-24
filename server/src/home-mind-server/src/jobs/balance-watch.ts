/**
 * Periodic balance watch (cloud mode only).
 *
 * The configured API key can describe itself: the OpenAI-compatible endpoint
 * we talk to exposes `GET {base}/key`, which returns the key's remaining
 * credit and rolling usage windows. From those we estimate "days of typical
 * use left" and surface two Home Assistant persistent notifications:
 *
 *   - warned  (≈3 days left):  a heads-up to top up at nives.house
 *   - paused  (≈1 day / empty): Nives is about to stop responding
 *
 * The state is latched in a small file under /data so a notification fires
 * once per transition, not once per poll — a user who dismisses the heads-up
 * is not nagged again six hours later. Any top-up raises the balance, the
 * next poll computes "ok", and both notifications are dismissed.
 *
 * Deliberately narrow:
 *   - Runs only when LLM_MODE=cloud. A bring-your-own-key user manages their
 *     own account; telling them to top up at nives.house would be wrong.
 *   - Runs only for keys without a scheduled limit reset (`limit_reset` null).
 *     A monthly-resetting allowance is a different message ("resets on the
 *     1st"), and those accounts get email from the cloud side already.
 *   - Notification first, latch second: if HA is briefly unreachable the
 *     worst case is the same notification re-created next poll (same id,
 *     silently replaced) — never a missed warning.
 */

import { readFileSync, writeFileSync } from "node:fs";

export interface KeyInfo {
  limit: number | null;
  limit_remaining: number | null;
  limit_reset: string | null;
  usage_weekly: number;
  usage_monthly: number;
}

export type BalanceState = "ok" | "warned" | "paused";

interface NotificationTarget {
  callService(
    domain: string,
    service: string,
    entityId?: string,
    data?: Record<string, unknown>
  ): Promise<unknown>;
}

export interface BalanceWatchOptions {
  /** Only true in cloud mode — the job is a no-op otherwise. */
  enabled: boolean;
  apiKey: string | undefined;
  /** OpenAI-compatible base URL; key info is read from `${baseUrl}/key`. */
  baseUrl: string | undefined;
  ha: NotificationTarget;
  /** Latch file; survives restarts so users aren't re-notified. */
  statePath?: string;
  intervalHours?: number;
  fetchImpl?: typeof fetch;
}

const WARNED_DAYS = 3;
const PAUSED_DAYS = 1;
/** Below this many dollars the balance is treated as gone regardless of pace. */
const EMPTY_FLOOR_USD = 0.05;
/** Assumed daily burn when the key has no usage history yet. */
const DEFAULT_DAILY_BURN_USD = 0.15;

const WARNED_NOTIFICATION_ID = "nives_low_balance";
const PAUSED_NOTIFICATION_ID = "nives_balance_paused";

export function daysLeftText(days: number): string {
  if (days <= 1.5) return "about a day";
  return `about ${Math.round(days)} days`;
}

/**
 * Days of typical use left, from the key's rolling usage windows.
 * Mirrors the cloud-side estimate: a real week of usage is the best signal,
 * a month is the fallback, and a key with no history burns at the default
 * rate rather than "never".
 */
export function estimateDaysLeft(info: KeyInfo): number {
  const remaining = info.limit_remaining ?? 0;
  const observed =
    info.usage_weekly > 0
      ? info.usage_weekly / 7
      : info.usage_monthly > 0
        ? info.usage_monthly / 30
        : 0;
  const dailyBurn = observed > 0 ? observed : DEFAULT_DAILY_BURN_USD;
  return remaining / dailyBurn;
}

export function computeBalanceState(info: KeyInfo): BalanceState {
  const remaining = info.limit_remaining ?? 0;
  const days = estimateDaysLeft(info);
  if (remaining <= EMPTY_FLOOR_USD || days <= PAUSED_DAYS) return "paused";
  if (days <= WARNED_DAYS) return "warned";
  return "ok";
}

export class BalanceWatchJob {
  private timer: NodeJS.Timeout | null = null;
  private initialDelay: NodeJS.Timeout | null = null;
  private readonly statePath: string;
  private readonly intervalHours: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private opts: BalanceWatchOptions) {
    this.statePath = opts.statePath ?? "/data/.balance_state";
    this.intervalHours = opts.intervalHours ?? 6;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private get active(): boolean {
    return Boolean(this.opts.enabled && this.opts.apiKey && this.opts.baseUrl);
  }

  start(): void {
    if (!this.active) return;

    console.log(`[balance] Balance watch scheduled every ${this.intervalHours}h`);

    // First check after 60s (let the server and HA settle), then on interval.
    this.initialDelay = setTimeout(() => {
      this.runOnce().catch((err) => {
        console.error("[balance] Initial balance check failed:", err);
      });
      this.timer = setInterval(
        () => {
          this.runOnce().catch((err) => {
            console.error("[balance] Balance check failed:", err);
          });
        },
        this.intervalHours * 60 * 60 * 1000
      );
    }, 60_000);
  }

  stop(): void {
    if (this.initialDelay) {
      clearTimeout(this.initialDelay);
      this.initialDelay = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<void> {
    if (!this.active) return;

    const info = await this.fetchKeyInfo();
    if (!info) return;

    // A key with a scheduled reset (or no limit at all) is not a prepaid
    // balance — nothing to watch.
    if (info.limit_reset !== null || info.limit_remaining === null) return;

    const state = computeBalanceState(info);
    const previous = this.readState();
    if (state === previous) return;

    const days = estimateDaysLeft(info);
    console.log(
      `[balance] ${previous} -> ${state} ` +
        `($${info.limit_remaining.toFixed(2)} left, ~${days.toFixed(1)} days)`
    );

    if (state === "warned") {
      await this.dismiss(PAUSED_NOTIFICATION_ID);
      await this.notify(WARNED_NOTIFICATION_ID, {
        title: "Nives",
        message:
          `${capitalize(daysLeftText(days))} left on your Nives balance. ` +
          "Top up at [nives.house](https://nives.house) to keep Nives running without interruption.",
      });
    } else if (state === "paused") {
      await this.dismiss(WARNED_NOTIFICATION_ID);
      await this.notify(PAUSED_NOTIFICATION_ID, {
        title: "Nives",
        message:
          "Your Nives balance is empty, so Nives is about to stop responding. " +
          "Top up at [nives.house](https://nives.house) and everything resumes on its own — " +
          "your memories and settings stay put.",
      });
    } else {
      await this.dismiss(WARNED_NOTIFICATION_ID);
      await this.dismiss(PAUSED_NOTIFICATION_ID);
    }

    // Latch AFTER the notifications landed: if HA was unreachable we retry
    // the whole transition next poll instead of silently swallowing it.
    this.writeState(state);
  }

  private async fetchKeyInfo(): Promise<KeyInfo | null> {
    const url = `${this.opts.baseUrl!.replace(/\/+$/, "")}/key`;
    try {
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.opts.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.warn(`[balance] Key info request failed: HTTP ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { data?: Partial<KeyInfo> };
      const d = body.data;
      if (!d) return null;
      return {
        limit: d.limit ?? null,
        limit_remaining: d.limit_remaining ?? null,
        limit_reset: d.limit_reset ?? null,
        usage_weekly: d.usage_weekly ?? 0,
        usage_monthly: d.usage_monthly ?? 0,
      };
    } catch (err) {
      console.warn(`[balance] Key info request failed: ${String(err)}`);
      return null;
    }
  }

  private async notify(id: string, data: { title: string; message: string }): Promise<void> {
    await this.opts.ha.callService("persistent_notification", "create", undefined, {
      notification_id: id,
      ...data,
    });
  }

  private async dismiss(id: string): Promise<void> {
    try {
      await this.opts.ha.callService("persistent_notification", "dismiss", undefined, {
        notification_id: id,
      });
    } catch {
      // Dismissing something that isn't there is not a problem.
    }
  }

  private readState(): BalanceState {
    try {
      const raw = readFileSync(this.statePath, "utf8").trim();
      if (raw === "warned" || raw === "paused") return raw;
    } catch {
      // No latch yet — treat as ok.
    }
    return "ok";
  }

  private writeState(state: BalanceState): void {
    try {
      writeFileSync(this.statePath, state, "utf8");
    } catch (err) {
      console.warn(`[balance] Could not persist state: ${String(err)}`);
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
