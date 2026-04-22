import { describe, test, expect } from "bun:test";
import { patchConfig, isPluginManagedAuthToken } from "../src/auth/token-store";

const TEST_PATH = "/home/node/.openclaw/secrets/shell-security-auth-token";

function getAuthToken(cfg: unknown): unknown {
  const root = cfg as Record<string, unknown>;
  const plugins = root.plugins as Record<string, unknown>;
  const entries = plugins.entries as Record<string, unknown>;
  const entry = entries["shell-security"] as Record<string, unknown>;
  const config = entry.config as Record<string, unknown>;
  return config.authToken;
}

function getProvider(cfg: unknown): unknown {
  const root = cfg as Record<string, unknown>;
  const secrets = root.secrets as Record<string, unknown>;
  const providers = secrets.providers as Record<string, unknown>;
  return providers.kilocode_shell_security;
}

describe("patchConfig", () => {
  test("patches an empty config", () => {
    const next = patchConfig({}, TEST_PATH);
    expect(getProvider(next)).toEqual({
      source: "file",
      path: TEST_PATH,
      mode: "singleValue",
    });
    expect(getAuthToken(next)).toEqual({
      source: "file",
      provider: "kilocode_shell_security",
      id: "value",
    });
  });

  test("treats null/undefined config as empty", () => {
    expect(() => patchConfig(null, TEST_PATH)).not.toThrow();
    expect(() => patchConfig(undefined, TEST_PATH)).not.toThrow();
    const next = patchConfig(null, TEST_PATH);
    expect(getProvider(next)).toBeDefined();
    expect(getAuthToken(next)).toBeDefined();
  });

  test("preserves unrelated plugin entries", () => {
    const cfg = {
      plugins: {
        entries: {
          "some-other-plugin": { config: { key: "value" } },
        },
      },
    };
    const next = patchConfig(cfg, TEST_PATH) as Record<string, unknown>;
    const plugins = next.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, unknown>;
    expect(entries["some-other-plugin"]).toEqual({
      config: { key: "value" },
    });
    expect(entries["shell-security"]).toBeDefined();
  });

  test("preserves unrelated secret providers", () => {
    const cfg = {
      secrets: {
        providers: {
          other_provider: { source: "env", path: "OTHER_TOKEN" },
        },
      },
    };
    const next = patchConfig(cfg, TEST_PATH) as Record<string, unknown>;
    const secrets = next.secrets as Record<string, unknown>;
    const providers = secrets.providers as Record<string, unknown>;
    expect(providers.other_provider).toEqual({
      source: "env",
      path: "OTHER_TOKEN",
    });
    expect(providers.kilocode_shell_security).toBeDefined();
  });

  test("overwrites existing authToken for this plugin", () => {
    const cfg = {
      plugins: {
        entries: {
          "shell-security": {
            config: {
              authToken: "stale-plain-string",
              apiBaseUrl: "http://host.docker.internal:3000",
            },
          },
        },
      },
    };
    const next = patchConfig(cfg, TEST_PATH);
    expect(getAuthToken(next)).toEqual({
      source: "file",
      provider: "kilocode_shell_security",
      id: "value",
    });
    // apiBaseUrl should survive
    const root = next as Record<string, unknown>;
    const plugins = root.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, unknown>;
    const entry = entries["shell-security"] as Record<string, unknown>;
    const config = entry.config as Record<string, unknown>;
    expect(config.apiBaseUrl).toBe("http://host.docker.internal:3000");
  });

  test("preserves other top-level keys", () => {
    const cfg = {
      model: "gpt-4o",
      theme: "dark",
    };
    const next = patchConfig(cfg, TEST_PATH) as Record<string, unknown>;
    expect(next.model).toBe("gpt-4o");
    expect(next.theme).toBe("dark");
    expect(next.secrets).toBeDefined();
    expect(next.plugins).toBeDefined();
  });

  test("tolerates corrupt nested shapes (non-object plugins)", () => {
    const cfg = { plugins: "not-an-object" };
    expect(() => patchConfig(cfg, TEST_PATH)).not.toThrow();
    const next = patchConfig(cfg, TEST_PATH);
    expect(getAuthToken(next)).toBeDefined();
  });
});

describe("isPluginManagedAuthToken", () => {
  test("true for a SecretRef pointing at our own provider", () => {
    const cfg = patchConfig({}, TEST_PATH);
    expect(isPluginManagedAuthToken(cfg)).toBe(true);
  });

  test("false for a plain-string authToken (user-set)", () => {
    const cfg = {
      plugins: {
        entries: {
          "shell-security": { config: { authToken: "user-typed-string" } },
        },
      },
    };
    expect(isPluginManagedAuthToken(cfg)).toBe(false);
  });

  test("false for a SecretRef pointing at a different provider", () => {
    const cfg = {
      plugins: {
        entries: {
          "shell-security": {
            config: {
              authToken: {
                source: "file",
                provider: "some_other_provider",
                id: "value",
              },
            },
          },
        },
      },
    };
    expect(isPluginManagedAuthToken(cfg)).toBe(false);
  });

  test("false when authToken is unset", () => {
    expect(isPluginManagedAuthToken({})).toBe(false);
    expect(isPluginManagedAuthToken({ plugins: {} })).toBe(false);
    expect(
      isPluginManagedAuthToken({
        plugins: { entries: { "shell-security": { config: {} } } },
      }),
    ).toBe(false);
  });

  test("tolerates null/undefined/non-object config", () => {
    expect(isPluginManagedAuthToken(null)).toBe(false);
    expect(isPluginManagedAuthToken(undefined)).toBe(false);
    expect(isPluginManagedAuthToken("string")).toBe(false);
    expect(isPluginManagedAuthToken({ plugins: "not-an-object" })).toBe(false);
  });
});
