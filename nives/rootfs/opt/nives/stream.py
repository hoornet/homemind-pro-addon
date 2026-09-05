"""Turning the Nives server's streamed reply into Assist chat-log deltas.

Pure Python on purpose: nothing here imports Home Assistant, so it can be
tested on a plain interpreter. conversation.py owns the network and the
chat log; this module owns the two pieces of logic in between.

The server (POST /api/chat/stream) sends Server-Sent Events:

    turn    a new assistant message begins (one per model turn)
    chunk   {"text": ...}  text of the current message
    status  {"text": ...}  the server's own heads-up before a long batch of
                           tool calls; shown, never part of the reply
    done    the complete response, exactly what /api/chat would return
    error   {"error": ...}

The chat log wants deltas: a dict with a "role" key starts a new assistant
message, a dict with "content" appends text to the current one. Home
Assistant takes the spoken reply from the LAST assistant message, so a
heads-up or the model's own "give me a moment" sentence before its tool calls
becomes an earlier message: visible in the dialog, not read aloud twice.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

SseEvent = tuple[str, dict[str, Any]]


class SseParser:
    """Feed it lines; it returns complete events.

    Only the subset of SSE the server produces: `event:` and `data:` lines,
    one data line per event, a blank line to end it.
    """

    def __init__(self) -> None:
        self._event = "message"
        self._data: list[str] = []

    def feed(self, line: str) -> list[SseEvent]:
        """Return the events completed by this line (usually none or one)."""
        line = line.rstrip("\r\n")
        if line == "":
            if not self._data:
                self._event = "message"
                return []
            raw = "\n".join(self._data)
            event, self._event, self._data = self._event, "message", []
            try:
                data = json.loads(raw)
            except ValueError:
                data = {"raw": raw}
            if not isinstance(data, dict):
                data = {"value": data}
            return [(event, data)]
        if line.startswith(":"):
            return []
        field, _, value = line.partition(":")
        value = value.removeprefix(" ")
        if field == "event":
            self._event = value
        elif field == "data":
            self._data.append(value)
        return []


class DeltaBuilder:
    """Turn server events into chat-log deltas, one server event at a time."""

    def __init__(self) -> None:
        self._need_role = True
        self._current = ""  # text streamed into the current message
        self._any_text = False
        self.final: dict[str, Any] | None = None
        self.error: str | None = None

    def handle(self, event: str, data: dict[str, Any]) -> Iterator[dict[str, Any]]:
        """Yield the deltas this event produces."""
        if event == "turn":
            # Lazily: a turn that never writes text (a bare batch of tool
            # calls) must not leave an empty bubble behind.
            self._need_role = True
            return
        if event == "status":
            text = str(data.get("text") or "").strip()
            if text:
                yield {"role": "assistant"}
                yield {"content": text}
                self._any_text = True
                self._need_role = True
                self._current = ""
            return
        if event == "chunk":
            text = data.get("text")
            if not isinstance(text, str) or text == "":
                return
            if self._need_role:
                yield {"role": "assistant"}
                self._need_role = False
                self._current = ""
            self._current += text
            self._any_text = True
            yield {"content": text}
            return
        if event == "done":
            self.final = data
            yield from self._finish(data)
            return
        if event == "error":
            self.error = str(data.get("error") or "unknown error")
            return

    def _finish(self, data: dict[str, Any]) -> Iterator[dict[str, Any]]:
        """Reconcile what was streamed with the complete response.

        Normally the final text is what was streamed for the last message,
        sometimes with a sentence appended that the server adds after the
        model stops (a reply that ran out of room says so). Anything else,
        a reply that was never streamed at all, or an error hint standing in
        for an empty reply, becomes its own message.
        """
        final = data.get("response")
        if not isinstance(final, str) or final == "":
            error = data.get("error")
            hint = error.get("hint") if isinstance(error, dict) else None
            code = error.get("code") if isinstance(error, dict) else None
            if hint:
                final = f"{hint} [{code}]" if code else hint
            elif self._any_text:
                return
            else:
                final = "I received your request but got no response."
        if not self._need_role and final == self._current:
            return
        if not self._need_role and final.startswith(self._current) and self._current:
            yield {"content": final[len(self._current):]}
            self._current = final
            return
        yield {"role": "assistant"}
        yield {"content": final}
        self._need_role = False
        self._current = final

    @property
    def wrote_anything(self) -> bool:
        """Whether at least one assistant message has content."""
        return self._any_text
