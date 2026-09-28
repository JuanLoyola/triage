/**
 * Tests for the browser session identity.
 *
 * The id is what separates one visitor's run budget from another's, so its
 * lifecycle matters: stable within a tab, regenerated after the storage is
 * cleared, and degraded safely when storage is unavailable.
 */
import { getSessionId, sessionHeaders, STORAGE_KEY } from "@/lib/session";

describe("getSessionId", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    jest.resetModules();
  });

  it("creates an id on first call", () => {
    const id = getSessionId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("is stable across calls in the same tab", () => {
    const first = getSessionId();
    const second = getSessionId();
    expect(second).toBe(first);
  });

  it("persists to sessionStorage", () => {
    const id = getSessionId();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(id);
  });

  it("survives a fresh module load, as a page reload would", async () => {
    const id = getSessionId();
    jest.resetModules();
    const reloaded = await import("@/lib/session");
    expect(reloaded.getSessionId()).toBe(id);
  });

  it("issues a new id after the storage is cleared", () => {
    const first = getSessionId();
    window.sessionStorage.clear();
    const second = getSessionId();
    expect(second).not.toBe(first);
  });

  it("generates ids that satisfy the backend pattern", () => {
    // Mirrors SESSION_ID_PATTERN in backend/app/ratelimit.py:
    // ^[A-Za-z0-9_-]{8,64}$. A UUID with dashes passes; a rejected id would
    // silently collapse every visitor into one shared bucket.
    const id = getSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it("degrades to a shared bucket when storage is blocked", () => {
    // Private browsing throws on setItem. Returning a constant is intentional:
    // the backend then uses its strict fallback bucket instead of failing.
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    expect(getSessionId()).toBe("no-storage");
    expect(() => getSessionId()).not.toThrow();

    setItem.mockRestore();
  });
});

describe("sessionHeaders", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("sends the id under the header the backend reads", () => {
    const headers = sessionHeaders();
    expect(headers).toHaveProperty("X-Session-Id");
    expect(headers["X-Session-Id"]).toBe(getSessionId());
  });
});
