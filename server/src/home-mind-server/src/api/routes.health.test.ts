import { describe, it, expect } from "vitest";
import { healthCapabilities } from "./routes.js";

// The HA integration decides from /api/health whether to register speech-to-text
// and text-to-speech entities at all, and which languages the speaking one
// offers. Getting these wrong is invisible on the server and breaks the Assist
// pipeline on the other side: a missing flag silently drops a voice the user
// configured, a spurious one leaves an entity that answers every request 501.

describe("healthCapabilities", () => {
  const tts = { synthesize: async () => Buffer.from("") };
  const stt = { transcribe: async () => "" };

  it("reports nothing beyond chat when neither service is configured", () => {
    expect(healthCapabilities(undefined, undefined, undefined)).toEqual({
      stt: false,
      tts: false,
      ttsLanguage: null,
    });
  });

  it("reports each service independently", () => {
    expect(healthCapabilities(stt, undefined).stt).toBe(true);
    expect(healthCapabilities(stt, undefined).tts).toBe(false);
    expect(healthCapabilities(undefined, tts).tts).toBe(true);
    expect(healthCapabilities(undefined, tts).stt).toBe(false);
  });

  it("names the voice's language when synthesis is configured", () => {
    expect(healthCapabilities(undefined, tts, "sl").ttsLanguage).toBe("sl");
  });

  it("reports no language when the voice's language is unset", () => {
    expect(healthCapabilities(undefined, tts, undefined).ttsLanguage).toBeNull();
    expect(healthCapabilities(undefined, tts, "   ").ttsLanguage).toBeNull();
  });

  it("never names a language when there is no voice to speak it", () => {
    // Otherwise the integration advertises a language for an entity that
    // answers every request with a 501.
    expect(healthCapabilities(undefined, undefined, "sl").ttsLanguage).toBeNull();
  });
});
