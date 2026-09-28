/**
 * Browser session identity.
 *
 * There is no login, so there is no user id. The dashboard generates a random
 * id, keeps it in `sessionStorage`, and sends it as a header. The backend
 * counts runs per that id, so each visitor gets their own daily budget.
 *
 * `sessionStorage` (not `localStorage`) on purpose: it is scoped to the tab, so
 * closing the browser gives a clean slate without touching the rest of the site.
 *
 * This is not a security control. Anyone can clear storage or send a new id.
 * That is what the backend's global ceiling is for.
 */
const STORAGE_KEY = "triage-session-id";

/** Exported so tests can assert the storage contract. */
export { STORAGE_KEY };

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for browsers without randomUUID.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "server-render";

  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const created = generateId();
    window.sessionStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Private mode or blocked storage. The backend falls back to one shared
    // bucket, which is stricter, so degrade rather than break.
    return "no-storage";
  }
}

export function sessionHeaders(): Record<string, string> {
  return { "X-Session-Id": getSessionId() };
}
