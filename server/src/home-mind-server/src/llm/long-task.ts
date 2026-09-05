/**
 * The one moment the server can tell a request is going to take a while.
 *
 * Predicting it from the question is guesswork; observing it is not. The
 * model's first turn returns its plan, a batch of tool calls, before any of
 * them runs, and what is in that batch is what decides the wait: a week of
 * history for six sensors is tens of seconds of fetching and a much larger
 * next prompt, while one call_service is over in milliseconds. So the
 * decision is taken here, from the batch, and a heads-up goes out only when
 * the batch qualifies. "Turn off the kitchen light" never sees one.
 *
 * The model is asked (prompts.ts) to write this sentence itself, in the
 * user's language, before a long batch. This is the fallback for when it
 * did not, so the person waiting is told something either way.
 */

export interface PlannedCall {
  name: string;
  args: Record<string, unknown>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Span of a get_history call in days, or 0 when it cannot be read. */
function historyDays(args: Record<string, unknown>): number {
  const start = typeof args.start_time === "string" ? Date.parse(args.start_time) : NaN;
  if (Number.isNaN(start)) return 0;
  const end = typeof args.end_time === "string" ? Date.parse(args.end_time) : Date.now();
  if (Number.isNaN(end) || end <= start) return 0;
  return (end - start) / DAY_MS;
}

/**
 * A short heads-up for a batch that will take a while, or `null` for a batch
 * that will not. Qualifies when any history call spans more than a day, or
 * when three or more sensors' histories are read at once. Everything else,
 * including a burst of quick searches, stays silent.
 */
export function describeLongBatch(calls: PlannedCall[]): string | null {
  const history = calls.filter((c) => c.name === "get_history");
  if (history.length === 0) return null;

  const days = Math.max(...history.map((c) => historyDays(c.args)));
  const sensors = new Set(
    history.map((c) => (typeof c.args.entity_id === "string" ? c.args.entity_id : ""))
  );
  sensors.delete("");
  const count = Math.max(sensors.size, 1);

  if (days <= 1 && history.length < 3) return null;

  const span =
    days > 1.5 ? `${Math.round(days)} days of history` : "a day of history";
  const from = count === 1 ? "one sensor" : `${count} sensors`;
  return `Give me a moment. I'm reading ${span} from ${from}.`;
}
