import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createAuthMiddleware } from "./auth.js";

/**
 * The add-on has required a token since 2.4.0, so this middleware is the only
 * thing between the container network and full control of the user's home
 * (/api/chat drives Home Assistant; DELETE /api/memory/:userId erases everything
 * it has learned). It was previously untested because nothing set API_TOKEN.
 */

function mockReq(overrides: Partial<Request> = {}): Request {
  return { path: "/chat", headers: {}, ...overrides } as Request;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

const TOKEN = "a".repeat(64);

describe("createAuthMiddleware", () => {
  describe("when no token is configured", () => {
    it("lets every request through", () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = mockRes();
      createAuthMiddleware(undefined)(mockReq(), res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    });

    it("lets an empty-string token behave as unset", () => {
      const next = vi.fn() as unknown as NextFunction;
      createAuthMiddleware("")(mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe("when a token is configured", () => {
    const mw = createAuthMiddleware(TOKEN);

    it("allows /health without any credentials", () => {
      // The config flow probes /health before it has a token, and HA's own
      // health checks must not need one either.
      const next = vi.fn() as unknown as NextFunction;
      const res = mockRes();
      mw(mockReq({ path: "/health" }), res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    });

    it("rejects a request with no Authorization header (401)", () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = mockRes();
      mw(mockReq(), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects a non-Bearer scheme (401)", () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = mockRes();
      mw(mockReq({ headers: { authorization: `Basic ${TOKEN}` } }), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects a wrong token of the same length (403)", () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = mockRes();
      mw(mockReq({ headers: { authorization: `Bearer ${"b".repeat(64)}` } }), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it("rejects a wrong token of a different length without throwing (403)", () => {
      // timingSafeEqual throws on length mismatch, so the length guard has to
      // come first or this is a 500 — and a crash loop instead of a rejection.
      const next = vi.fn() as unknown as NextFunction;
      const res = mockRes();
      expect(() =>
        mw(mockReq({ headers: { authorization: "Bearer short" } }), res, next)
      ).not.toThrow();
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it("rejects a token that is a prefix of the real one (403)", () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = mockRes();
      mw(mockReq({ headers: { authorization: `Bearer ${TOKEN.slice(0, 32)}` } }), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it("accepts the correct token", () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = mockRes();
      mw(mockReq({ headers: { authorization: `Bearer ${TOKEN}` } }), res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    });

    it("guards every non-health route, not just chat", () => {
      for (const path of [
        "/chat",
        "/chat/stream",
        "/memory/default",
        "/conversations/default",
        "/admin/conversations",
        "/stt",
        "/tts",
      ]) {
        const next = vi.fn() as unknown as NextFunction;
        const res = mockRes();
        mw(mockReq({ path }), res, next);
        expect(next, `${path} must require auth`).not.toHaveBeenCalled();
        expect(res.statusCode, `${path} must require auth`).toBe(401);
      }
    });
  });
});
