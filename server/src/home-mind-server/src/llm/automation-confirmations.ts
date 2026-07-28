/**
 * Server-enforced confirmation gate for automation changes (create/update/delete).
 *
 * Constraints learned the hard way:
 *  - The conversation store persists only final user/assistant TEXT, never tool
 *    calls/results — so a confirmation token returned in a tool result cannot
 *    survive to the next turn (the model can't echo it back). [killed v2.1.9]
 *  - The model reformats automation args wildly between calls (action as array vs
 *    object, service vs service_data, notify.x vs x+domain, alias case…), so
 *    fingerprinting the full payload almost never matches across turns → endless
 *    re-preview loop. [killed v2.1.10]
 *
 * So: the confirmation signal is "the same tool was previewed for this
 * conversation in an EARLIER turn" (i.e. the user has since replied), scoped by
 * one stable identity string that the model does NOT reformat — entity_id for
 * update/delete, the normalized alias for create — so confirming one automation
 * can't accidentally act on a different one. The full payload is still never
 * compared. The per-turn nonce blocks confirming in the same turn a preview was
 * shown.
 */

interface PendingPreview {
  conversationId: string;
  turnId: string;
  createdAt: number;
}

const TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Keyed by conversation + tool + identity, so SEVERAL changes can be pending at
 * once. It used to be one slot per conversation, which silently could not
 * survive a request that needs two automations:
 *
 *   preview "cooling on"  → slot = cooling-on
 *   preview "cooling off" → slot = cooling-off   (overwrote cooling-on)
 *   user says yes
 *   create "cooling on"   → slot holds cooling-off → mismatch → re-preview,
 *                           overwriting cooling-off
 *   create "cooling off"  → slot holds cooling-on  → mismatch → re-preview …
 *
 * — an infinite confirmation loop that never creates anything. Observed live:
 * five rounds of "shall I create these?" and an empty automations.yaml. It only
 * showed up once 2.4.5 started telling the model to build both halves of an
 * "on above X, off below Y" request in one go; before that it made one
 * automation at a time and a single slot was enough.
 */
const pending = new Map<string, PendingPreview>();

/** NUL-separated (spelled as an escape — a literal control byte here makes git
 * treat this file as binary and kills diffs). NUL cannot appear in a
 * conversation id, tool name or entity_id. */
function slotKey(
  conversationId: string,
  toolName: string,
  input: Record<string, unknown>
): string {
  return `${conversationId}\u0000${toolName}\u0000${identityKey(toolName, input)}`;
}

function pruneExpired(now: number): void {
  for (const [key, entry] of pending) {
    if (now - entry.createdAt > TTL_MS) pending.delete(key);
  }
}

/**
 * Normalize an alias down to the part the model keeps stable across turns.
 * It reliably reformats structure (trigger/action shape) but echoes the alias
 * back as words; the two observed drifts are the auto-added "Nives: " prefix
 * and casing, both of which this strips.
 */
function normalizeAlias(alias: unknown): string {
  return String(alias ?? "")
    .trim()
    .replace(/^nives:\s*/i, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Stable identity for a change. update/delete are keyed by entity_id; create is
 * keyed by normalized alias.
 *
 * Create used to have no identity at all, which meant ANY create in a later turn
 * confirmed ANY earlier create preview: "make a sunset light automation" →
 * preview → "no, forget it, turn the heating off at 11pm instead" → committed
 * the heating automation without ever asking. Scoping by alias closes that
 * without reintroducing the v2.1.10 payload-fingerprint loop — a mismatch just
 * re-previews (one extra confirmation prompt), it does not fail.
 */
function identityKey(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "update_automation" || toolName === "delete_automation") {
    return String(input.entity_id ?? "").trim();
  }
  if (toolName === "create_automation") {
    return normalizeAlias(input.alias);
  }
  return "";
}

/**
 * True if this same change was previewed for this conversation in an EARLIER turn
 * (so the user has since replied) — and consume that preview. Payload formatting
 * is intentionally NOT compared; update/delete are matched by entity_id.
 */
export function isConfirmed(
  conversationId: string,
  toolName: string,
  input: Record<string, unknown>,
  turnId: string
): boolean {
  const key = slotKey(conversationId, toolName, input);
  const entry = pending.get(key);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > TTL_MS) {
    pending.delete(key);
    return false;
  }
  // A later turn → a real user reply happened in between.
  if (entry.turnId !== turnId) {
    pending.delete(key);
    return true;
  }
  return false;
}

/** Record that a change was previewed (awaiting the user's confirmation). */
export function recordPreview(
  conversationId: string,
  toolName: string,
  input: Record<string, unknown>,
  turnId: string
): void {
  const now = Date.now();
  pruneExpired(now);
  pending.set(slotKey(conversationId, toolName, input), {
    conversationId,
    turnId,
    createdAt: now,
  });
}

/** Drop ALL of a conversation's pending previews (e.g. the user changed their mind). */
export function clearConfirmation(conversationId: string): void {
  for (const [key, entry] of pending) {
    if (entry.conversationId === conversationId) pending.delete(key);
  }
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** The kind of each trigger/condition, tolerating both `platform:` and `trigger:`/`condition:` keys. */
function kindsOf(value: unknown, ...keys: string[]): string[] {
  return asArray(value).map((entry) => {
    const obj = (entry ?? {}) as Record<string, unknown>;
    for (const key of keys) {
      if (obj[key] !== undefined) return String(obj[key]).toLowerCase();
    }
    return "";
  });
}

/**
 * Structural warnings about what the payload will and won't do.
 *
 * These exist because the preview alone was not enough. A real session: the user
 * asked for cooling "when I'm at home", between 20:00 and 22:00, that switches
 * off again at 20°C. What got created was a bare 20:00 time trigger with one
 * numeric_state condition — no presence, no time window, no switch-off — and the
 * model told the user it had included a 20:00–22:00 check. The payload shown in
 * the preview was correct and complete; an absent `condition` key simply reads
 * as nothing worth mentioning, so it went unmentioned.
 *
 * So state the absences as facts the model has to account for, rather than
 * leaving them as missing keys.
 */
export function previewNotes(input: Record<string, unknown>): string[] {
  const notes: string[] = [];

  if (asArray(input.condition).length === 0) {
    notes.push(
      "This automation has NO conditions. It will run every single time the trigger fires — regardless of who is home, the time of day, or any other state. If the user asked for any such restriction, it is NOT in this automation and you must say so."
    );
  }

  const triggerKinds = kindsOf(input.trigger, "platform", "trigger");
  const conditionKinds = kindsOf(input.condition, "condition");
  if (
    triggerKinds.length > 0 &&
    triggerKinds.every((kind) => kind === "time") &&
    conditionKinds.includes("numeric_state")
  ) {
    notes.push(
      "The only trigger is a fixed time, so the numeric value is checked once, at that instant, and never again. If it crosses the threshold later it will NOT run. If the user wants it to react whenever the value changes, a numeric_state trigger has to be added as well — say this plainly rather than implying a window is covered."
    );
  }

  // Triggers are independent: each one fires the automation on its own. A
  // numeric_state TRIGGER therefore does not gate the time trigger next to it —
  // only a CONDITION gates every path. Live consequence (2026-07-27): "cool the
  // bedroom 20:00-22:00 if over 22C" got a numeric trigger + a 20:00 trigger and
  // no numeric condition, so at 20:00 sharp the AC switched on regardless of
  // temperature — and when asked to fix it, the model refused, reasoning the
  // threshold was "already covered" because it saw the trigger.
  if (
    triggerKinds.includes("time") &&
    triggerKinds.includes("numeric_state") &&
    !conditionKinds.includes("numeric_state")
  ) {
    notes.push(
      "This automation has BOTH a fixed-time trigger and a value-threshold trigger, but NO value condition. Triggers fire independently, so at the fixed time the action runs REGARDLESS of the value — the threshold on the other trigger does not protect it. If the action should only happen past the threshold, the same threshold must ALSO be a condition."
    );
  }

  return notes;
}

/** Build a compact, human-readable preview of a pending automation change. */
export function describePending(
  toolName: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  switch (toolName) {
    case "create_automation":
      return {
        action: "create automation",
        alias: input.alias,
        trigger: input.trigger,
        // Explicit, not absent: a missing key is easy to narrate straight past.
        condition: input.condition ?? "(none — runs unconditionally)",
        do: input.action,
        mode: input.mode,
        notes: previewNotes(input),
      };
    case "update_automation": {
      const FIELDS = ["alias", "trigger", "condition", "action", "mode"];
      const changes: Record<string, unknown> = {};
      for (const key of FIELDS) {
        if (input[key] !== undefined) changes[key] = input[key];
      }
      const changed = FIELDS.filter((key) => input[key] !== undefined);
      const untouched = FIELDS.filter((key) => input[key] === undefined);
      const notes: string[] = [];
      // Enumerate what this update does NOT do, in words. Live consequence
      // (2026-07-27): asked to lift a time window off an automation, the model
      // sent payloads that only ever replaced `trigger`, while telling the user
      // the window was removed. The preview showed the changes accurately —
      // but nothing stated that `condition` was untouched, so the narration
      // went unchallenged and a successful no-op was reported as the fix.
      if (untouched.length > 0) {
        notes.push(
          `This update changes ONLY: ${changed.join(", ") || "(nothing)"}. It does NOT touch: ${untouched.join(", ")} — those stay exactly as they are. If the user asked for a change to one of those fields, this update does NOT deliver it; say so instead of describing it as done.`
        );
      }
      // An update only replaces the fields it passes, so an absent condition
      // here means "unchanged" — unlike create, no warning for that. But a
      // condition passed as an EMPTY array/null strips every condition off the
      // existing automation, which is almost never what the user asked for.
      if (input.condition !== undefined && asArray(input.condition).length === 0) {
        notes.push(
          "This update REMOVES ALL conditions from the automation — it will then run every time its trigger fires, regardless of who is home or the time of day. If the user only wanted to change something else, do not pass the condition field at all."
        );
      }
      return { action: "update automation", entity_id: input.entity_id, changes, notes };
    }
    case "delete_automation":
      return { action: "delete automation", entity_id: input.entity_id };
    default:
      return { action: toolName, input };
  }
}
