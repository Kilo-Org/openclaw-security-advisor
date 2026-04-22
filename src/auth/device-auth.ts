import { resolveFetch } from "openclaw/plugin-sdk/fetch-runtime";
import type { PluginLogger } from "./token-store.js";

/**
 * How long a single poll call is willing to block the tool handler. We
 * keep this well under any reasonable LLM/gateway tool-execution budget.
 * The happy path (user approved in their browser before calling back to
 * the plugin) typically resolves in one poll interval (3s); the rest of
 * this window is grace for slow approvals. If we hit the deadline
 * without a terminal state from the server, we return "timeout" and the
 * caller keeps the pending code in place so a subsequent invocation can
 * keep polling.
 */
const POLL_TIMEOUT_MS = 30 * 1_000;
const POLL_INTERVAL_MS = 3_000;
/**
 * Per-request deadline for a single poll HTTP call. Without this,
 * a hung connection could outlive the overall POLL_TIMEOUT_MS budget,
 * because the loop only re-checks the deadline between iterations.
 * Capped below the overall budget so the loop stays interruptible.
 */
const POLL_REQUEST_TIMEOUT_MS = 10 * 1_000;

type DeviceAuthInitResponse = {
  code: string;
  verificationUrl: string;
  expiresIn: number;
};

type DeviceAuthPollResponse =
  | { status: "pending" }
  | { status: "approved"; token: string; userId: string; userEmail: string }
  | { status: "denied" }
  | { status: "expired" };

export type DeviceAuthStartResult = {
  kind: "started";
  code: string;
  verificationUrl: string;
  expiresIn: number;
};

/**
 * Poll result kinds:
 * - approved: server returned approval + token. Ready to run the checkup.
 * - denied:   user explicitly denied in the browser. Clear pending code.
 * - expired:  server-reported 410 Gone or server-reported expired status.
 *             The device-auth code itself is dead. Clear pending code.
 * - timeout:  we hit our local POLL_TIMEOUT_MS deadline while the server
 *             was still returning pending. The code may still be valid
 *             server-side; caller should NOT clear pending code so the
 *             next invocation can keep polling.
 *
 * `pending` is intentionally NOT in this union. `pollDeviceAuth()` loops
 * internally and never returns the transient pending state — it only
 * returns a terminal outcome or `timeout`.
 */
export type DeviceAuthPollResult =
  | { kind: "approved"; token: string }
  | { kind: "denied" }
  | { kind: "expired" }
  | { kind: "timeout" };

/**
 * Create a device auth request and return the code + URL for the user to visit.
 * Call this once, show the result to the user, then poll with pollDeviceAuth().
 *
 * The server returns a generic `/device-auth?code=...` URL in `verificationUrl`,
 * built from APP_URL (the user-facing host, e.g. https://app.kilo.ai in prod).
 * We rewrite only the PATH to `/openclaw-advisor?code=...`, keeping the origin
 * authoritative. Rebuilding the URL from `apiBase` would be wrong in production,
 * where the API host (https://api.kilo.ai) and the app host (https://app.kilo.ai)
 * are different — the user needs the app host to land on the signup flow.
 *
 * The cloud side uses the `/openclaw-advisor` path prefix to attribute Security
 * Advisor signups and layer a per-product signup bonus on top of the standard
 * welcome credits. Old plugin builds keep working against the server — they just
 * land on the generic `/device-auth` URL and don't qualify for the bonus, which
 * is the intended behavior.
 */
export async function startDeviceAuth(
  apiBase: string,
): Promise<DeviceAuthStartResult> {
  const fetchFn: typeof fetch = resolveFetch() ?? globalThis.fetch;
  const resp = await fetchFn(`${apiBase}/api/device-auth/codes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!resp.ok) {
    throw new Error(
      `Failed to start KiloCode authentication (HTTP ${resp.status})`,
    );
  }
  const data = (await resp.json()) as DeviceAuthInitResponse;
  const advisorUrl = new URL(data.verificationUrl);
  advisorUrl.pathname = "/openclaw-advisor";
  return {
    kind: "started",
    code: data.code,
    verificationUrl: advisorUrl.toString(),
    expiresIn: data.expiresIn,
  };
}

/**
 * Poll a device auth code until it resolves (approved/denied/expired),
 * or until the local POLL_TIMEOUT_MS deadline is hit (returns "timeout").
 * Server-reported 410 Gone returns "expired". Transient network errors
 * during polling are logged at debug level and the loop continues until
 * the deadline.
 */
export async function pollDeviceAuth(
  apiBase: string,
  code: string,
  logger?: PluginLogger,
): Promise<DeviceAuthPollResult> {
  const fetchFn: typeof fetch = resolveFetch() ?? globalThis.fetch;
  // Defense-in-depth: the code is a server-issued opaque string, but if
  // the server ever returned one containing `/` or other URL meta-chars
  // an unencoded concat would silently redirect the poll to a different
  // endpoint under the same origin.
  const pollUrl = `${apiBase}/api/device-auth/codes/${encodeURIComponent(code)}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    // Clamp sleep to remaining budget so we don't oversleep past the
    // deadline and then start yet another fetch.
    const sleepMs = Math.min(POLL_INTERVAL_MS, deadline - Date.now());
    if (sleepMs > 0) await sleep(sleepMs);
    // Same rationale for the per-request timeout: without this clamp,
    // a fetch started near the end of the budget could run for the
    // full POLL_REQUEST_TIMEOUT_MS and push us past the advertised
    // overall deadline. Skip the iteration entirely when the remaining
    // budget is zero or negative.
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const controller = new AbortController();
    const requestTimeout = setTimeout(
      () => controller.abort(),
      Math.min(POLL_REQUEST_TIMEOUT_MS, remaining),
    );
    try {
      const resp = await fetchFn(pollUrl, { signal: controller.signal });
      if (resp.status === 202) continue; // pending
      if (resp.status === 403) return { kind: "denied" };
      if (resp.status === 410) return { kind: "expired" };
      if (resp.ok) {
        const data = (await resp.json()) as DeviceAuthPollResponse;
        if (data.status === "approved")
          return { kind: "approved", token: data.token };
        if (data.status === "denied") return { kind: "denied" };
        if (data.status === "expired") return { kind: "expired" };
      }
    } catch (err) {
      // Transient network error (including per-request abort due to a
      // hung connection). Log at debug level so it's visible when
      // investigating real failures but not noisy on the happy path.
      const message = err instanceof Error ? err.message : String(err);
      logger?.debug?.(`shell-security: poll transient error: ${message}`);
    } finally {
      clearTimeout(requestTimeout);
    }
  }

  return { kind: "timeout" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
