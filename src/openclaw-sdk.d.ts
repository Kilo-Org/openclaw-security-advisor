/**
 * Ambient type declarations for the OpenClaw plugin SDK virtual modules.
 *
 * The runtime plugin host exposes these imports via internal aliasing; they
 * are NOT real npm packages and cannot be resolved at typecheck time without
 * these ambient declarations. This file is the single source of truth for
 * the SDK surface this plugin actually uses — if we start calling a new SDK
 * helper, declare its signature here.
 *
 * Tests shim the `openclaw/plugin-sdk/zod` path to the real `zod` devDep
 * via `test/preload.ts`; the runtime uses whatever version of zod the
 * plugin host bundles. As long as both satisfy the declared `z` surface,
 * the two code paths stay compatible.
 */

declare module "openclaw/plugin-sdk/plugin-entry" {
  /**
   * Subset of the SDK's OpenClawPluginReloadRegistration. Entries here let a
   * plugin override the gateway reload planner's default classification for
   * specific config prefixes. First-match wins, and plugin-registered rules
   * are evaluated before the base `plugins.* -> restart` rule, so declaring
   * `plugins.entries.<id>.config` here overrides the base restart for our
   * own config subtree.
   */
  export type PluginReloadRegistration = {
    restartPrefixes?: string[];
    hotPrefixes?: string[];
    noopPrefixes?: string[];
  };

  /**
   * Register a plugin with the OpenClaw runtime. The `register` callback
   * receives a runtime-provided plugin API object. The SDK's concrete
   * OpenClawPluginApi type is internal; we narrow it to our own structural
   * `PluginApi` inside the callback, so `any` here is intentional.
   */
  export function definePluginEntry(config: {
    id: string;
    name: string;
    description: string;
    reload?: PluginReloadRegistration;
    register: (api: any) => void;
  }): unknown;
}

declare module "openclaw/plugin-sdk/fetch-runtime" {
  /**
   * Returns the plugin host's preferred fetch implementation, or `null`
   * if none is exposed (in which case callers should fall back to the
   * global `fetch`).
   */
  export function resolveFetch(): typeof fetch | null;
}

declare module "openclaw/plugin-sdk/run-command" {
  /**
   * Run a command via the plugin host's command runner with a hard
   * timeout. Returns the full captured stdout/stderr plus the exit code.
   */
  export function runPluginCommandWithTimeout(args: {
    argv: string[];
    timeoutMs: number;
  }): Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>;
}

declare module "openclaw/plugin-sdk/zod" {
  // Re-export from the real `zod` package. The plugin host bundles its
  // own copy at runtime; this re-export exists so typecheck + tests see
  // a real implementation. Both code paths share the same `z` type
  // surface.
  export { z } from "zod";
}
