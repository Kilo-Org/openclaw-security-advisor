#!/usr/bin/env bun

/**
 * Version resolution for @kilocode/openclaw-security-advisor.
 *
 * Mirrors the kilocode CLI's @opencode-ai/script pattern
 * (see kilocode/node_modules/@opencode-ai/script/src/index.ts for the
 * reference implementation this file was adapted from).
 *
 * Intentionally duplicated — this repo has no cross-repo dependency on
 * the kilocode monorepo. If you change version/channel semantics in
 * either repo, cross-check by hand so the two stay in sync.
 *
 * Inputs (env vars):
 *   KILO_CHANNEL      — explicit channel (e.g. "latest", "rc", "beta"). Wins over everything.
 *   KILO_PRE_RELEASE  — "true" → channel defaults to "rc" when KILO_CHANNEL is not set.
 *   KILO_BUMP         — "major" | "minor" | "patch". How to bump the highest known version.
 *   KILO_VERSION      — explicit version override (e.g. "1.2.3"). Wins over KILO_BUMP.
 *   GH_REPO           — "owner/repo" slug. Used to query gh releases for the highest version.
 *
 * Outputs (written to $GITHUB_OUTPUT when available):
 *   version, tag, channel, preview
 *
 * Side effects:
 *   - Rewrites package.json version field.
 *   - Throws if a release with the target tag already exists on GH_REPO.
 *
 * Local preview:
 *   KILO_VERSION=0.1.0-beta.1 KILO_CHANNEL=beta bun script/version.ts
 */

import { $ } from "bun";

const NPM_PACKAGE = "@kilocode/openclaw-security-advisor";

const env = {
  KILO_CHANNEL: process.env.KILO_CHANNEL,
  KILO_BUMP: process.env.KILO_BUMP,
  KILO_VERSION: process.env.KILO_VERSION,
  KILO_PRE_RELEASE: process.env.KILO_PRE_RELEASE,
  GH_REPO: process.env.GH_REPO,
};

const CHANNEL = (() => {
  if (env.KILO_CHANNEL) return env.KILO_CHANNEL;
  if (env.KILO_PRE_RELEASE === "true") return "rc";
  return "latest";
})();

const IS_PREVIEW = CHANNEL !== "latest";

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  value: string;
};

function parseVersion(input: string): ParsedVersion | undefined {
  const match = input.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    value: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

function compareVersion(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

async function fetchLatestFromNpm(): Promise<string> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`);
    if (!res.ok) throw new Error(`npm registry returned ${res.status}`);
    const data = (await res.json()) as { version: string };
    return data.version;
  } catch {
    // Package not yet published. Seed at 0.0.0 so the first patch bump
    // lands at 0.0.1 (or whatever bump type was requested).
    return "0.0.0";
  }
}

async function fetchHighestKnown(): Promise<string> {
  if (!env.GH_REPO) return fetchLatestFromNpm();
  try {
    const result =
      await $`gh release list --json tagName --limit 100 --repo ${env.GH_REPO}`.json();
    const releases = result as { tagName: string }[];
    const versions = releases.flatMap((item) => {
      const v = parseVersion(item.tagName);
      return v ? [v] : [];
    });
    const highest = versions.sort(compareVersion).at(-1);
    if (highest) return highest.value;
  } catch {
    // gh not installed, unauthed, or no releases yet. Fall through.
  }
  return fetchLatestFromNpm();
}

function bumpVersion(current: string, type: string): string {
  const v = parseVersion(current);
  if (!v) throw new Error(`Cannot bump invalid version: ${current}`);
  const kind = type.toLowerCase();
  if (kind === "major") return `${v.major + 1}.0.0`;
  if (kind === "minor") return `${v.major}.${v.minor + 1}.0`;
  if (kind === "patch") return `${v.major}.${v.minor}.${v.patch + 1}`;
  throw new Error(
    `Unknown bump type: ${type} (expected major | minor | patch)`,
  );
}

function timestampSnapshot(channel: string): string {
  const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `0.0.0-${channel}-${ts}`;
}

const VERSION: string = await (async () => {
  if (env.KILO_VERSION) {
    // Accept either plain semver or prerelease semver (e.g. 0.1.0-beta.1).
    const trimmed = env.KILO_VERSION.trim().replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(trimmed)) {
      throw new Error(`KILO_VERSION is not valid semver: ${env.KILO_VERSION}`);
    }
    return trimmed;
  }
  if (IS_PREVIEW) {
    if (env.KILO_BUMP) {
      const current = await fetchHighestKnown();
      return bumpVersion(current, env.KILO_BUMP);
    }
    return timestampSnapshot(CHANNEL);
  }
  const current = await fetchHighestKnown();
  return bumpVersion(current, env.KILO_BUMP ?? "patch");
})();

const TAG = `v${VERSION}`;

// Guard against double-publishing: fail fast if a release with this tag
// already exists on the target repo. This covers both stable and preview
// channels. Skipped when GH_REPO is unset (local preview).
if (env.GH_REPO) {
  const existing = await $`gh release view ${TAG} --repo ${env.GH_REPO}`
    .nothrow()
    .quiet();
  if (existing.exitCode === 0) {
    throw new Error(
      `Release ${TAG} already exists on ${env.GH_REPO}. ` +
        `Bump the version or delete the existing release first.`,
    );
  }
}

// Rewrite package.json version in place.
const pkgPath = `${process.cwd()}/package.json`;
const pkg = await Bun.file(pkgPath).json();
pkg.version = VERSION;
await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// Emit outputs for the workflow to consume in downstream steps.
const outputs = [
  `version=${VERSION}`,
  `tag=${TAG}`,
  `channel=${CHANNEL}`,
  `preview=${IS_PREVIEW}`,
];

if (process.env.GITHUB_OUTPUT) {
  const existing = await Bun.file(process.env.GITHUB_OUTPUT)
    .text()
    .catch(() => "");
  await Bun.write(
    process.env.GITHUB_OUTPUT,
    existing + outputs.join("\n") + "\n",
  );
}

console.log(
  JSON.stringify(
    { version: VERSION, tag: TAG, channel: CHANNEL, preview: IS_PREVIEW },
    null,
    2,
  ),
);
