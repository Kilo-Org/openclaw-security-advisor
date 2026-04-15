// Test preload. Runtime plugin host provides zod via the SDK virtual
// path `openclaw/plugin-sdk/zod`; tests run without that host, so we
// alias it to the real `zod` devDep copy so schema modules import
// cleanly.
import { mock } from "bun:test";
import { z } from "zod";

mock.module("openclaw/plugin-sdk/zod", () => ({ z }));
