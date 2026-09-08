import { describe, it, expect, vi } from "vitest";
import { OpenAITtsService } from "./tts-service.js";

// The audio format has to be asked for by name. OpenAI's own API defaults to
// MP3, but an OpenAI-compatible endpoint need not — the one behind the add-on's
// cloud voice defaults to raw PCM. Left unset, /api/tts serves PCM bytes as
// audio/mpeg and every caller, the HA text-to-speech entity included, plays
// noise. Nothing else in the stack can detect that, so it is pinned here.

describe("OpenAITtsService", () => {
  function serviceWithSpy() {
    const create = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    const svc = new OpenAITtsService("k", "some/model", "some-voice", "https://example.invalid/v1");
    (svc as unknown as { client: { audio: { speech: { create: typeof create } } } }).client = {
      audio: { speech: { create } },
    };
    return { svc, create };
  }

  it("always asks for mp3", async () => {
    const { svc, create } = serviceWithSpy();
    await svc.synthesize("Dober dan.");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: "mp3" })
    );
  });

  it("passes the configured model and voice through unchanged", async () => {
    const { svc, create } = serviceWithSpy();
    await svc.synthesize("Dober dan.");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "some/model", voice: "some-voice", input: "Dober dan." })
    );
  });

  it("returns the audio as a Buffer", async () => {
    const { svc } = serviceWithSpy();
    expect(Buffer.isBuffer(await svc.synthesize("Dober dan."))).toBe(true);
  });
});
