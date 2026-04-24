# Releasing `@kilocode/shell-security`

Releases are cut from the `publish` workflow in GitHub Actions. There is no
local release script, no automated release on push, and no changesets tool.
Every release is a manual `workflow_dispatch`.

> **Committer identity:** post-publish commits to `main` are made by the
> `kilo-maintainer` GitHub App (not the generic `github-actions[bot]`),
> using a short-lived installation token minted inside the workflow. The
> app is the sole principal on `main`'s branch-ruleset bypass list — see
> [Branch protection](#branch-protection). If you see a release commit
> authored by anyone else, something's wrong; stop and investigate.
>
> **Required secrets** (already configured, documented here for
> disaster-recovery reference):
>
> - `KILO_MAINTAINER_APP_ID` — the numeric App ID.
> - `KILO_MAINTAINER_APP_SECRET` — the App's private key (full PEM).
>
> Both are consumed by `.github/actions/setup-git-committer/action.yml`.
> The same pair is used in `Kilo-Org/kilocode`; regenerating the
> private key there would require updating it here too.

## Channels

There are exactly two channels and they correspond to npm dist-tags:

| Channel  | npm dist-tag | Purpose                                            | Version format |
| -------- | ------------ | -------------------------------------------------- | -------------- |
| `latest` | `latest`     | Public stable releases. The default `npm install`. | `X.Y.Z`        |
| `dev`    | `dev`        | Internal dogfood snapshots. `npm install …@dev`.   | `X.Y.Z-dev.N`  |

That's the entire surface. There is no `beta`, `rc`, `next`, or `canary`.

## Pre-flight checklist

Before clicking "Run workflow", confirm:

- [ ] `main` is green on all three CI workflows (`typecheck`, `test`, `format`).
- [ ] `CHANGELOG.md` has the changes you're about to ship listed under `## [Unreleased]`.
- [ ] You know which channel you're targeting and which inputs you'll use (see paths below).
- [ ] The tag for the resulting version does **not** already exist on
      https://github.com/Kilo-Org/shell-security/releases.
      The workflow fails fast if it does, but check first — it's cheaper
      to pick a different bump than to recover from a partial publish.

## Cutting a release

1. Open https://github.com/Kilo-Org/shell-security/actions/workflows/publish.yml
2. Click **Run workflow** (top right).
3. Fill in the inputs — see paths below.
4. Click **Run workflow**.
5. Wait for the job to finish (typically 2–3 minutes).
6. Verify on [npm](https://www.npmjs.com/package/@kilocode/shell-security)
   that the new version shipped with the right dist-tag.
7. Verify on the [GitHub releases page](https://github.com/Kilo-Org/shell-security/releases)
   that the tag and release were created.

### Stable releases (`channel=latest`)

For public releases that go to `npm install @kilocode/shell-security`.

**Auto-bump (the common path):**

| Input     | Value                          |
| --------- | ------------------------------ |
| `channel` | `latest`                       |
| `bump`    | `patch` (or `minor` / `major`) |
| `version` | _(leave blank)_                |

The workflow queries the highest existing `vX.Y.Z` tag, bumps it, and
publishes. Example: highest stable is `v1.2.3`, you pick `bump=patch`,
the new version is `1.2.4`.

**Explicit version (rare):**

| Input     | Value           |
| --------- | --------------- |
| `channel` | `latest`        |
| `bump`    | _(leave blank)_ |
| `version` | `1.2.5`         |

Use this only when you need to skip a number or seed the very first stable
release (since auto-bump from a fresh repo would resolve to `0.0.1`, which
is rarely what you want for `1.0.0`).

### Dev snapshots (`channel=dev`)

For internal dogfood builds. Versions look like `0.1.0-dev.1`,
`0.1.0-dev.2`, etc. They publish to the `dev` npm dist-tag, so users get
them with `npm install @kilocode/shell-security@dev`.

**Continue current dev cycle (the common path):**

| Input     | Value           |
| --------- | --------------- |
| `channel` | `dev`           |
| `bump`    | _(leave blank)_ |
| `version` | _(leave blank)_ |

The workflow queries the highest existing `*-dev.N` tag and increments
the counter. Example: highest dev is `0.1.0-dev.5`, the new version is
`0.1.0-dev.6`. Same `0.1.0` base — only the dev counter moves.

**Start a new dev cycle (after a stable release):**

| Input     | Value                          |
| --------- | ------------------------------ |
| `channel` | `dev`                          |
| `bump`    | `patch` (or `minor` / `major`) |
| `version` | _(leave blank)_                |

The workflow takes the highest stable, applies the bump, and seeds
`dev.1`. Example: stable is `0.1.0`, you pick `bump=minor`, the new
version is `0.2.0-dev.1`. Use this when you've shipped a stable release
and want to start the next dev cycle.

**Explicit version (one-off):**

| Input     | Value           |
| --------- | --------------- |
| `channel` | `dev`           |
| `bump`    | _(leave blank)_ |
| `version` | `0.3.0-dev.1`   |

Format must match `X.Y.Z-dev.N` exactly. Use this for the very first dev
cut (since auto-bump from a fresh repo seeds at `0.0.1-dev.1`, which is
rarely the version you actually want), or to manually skip ahead.

## After a stable release

1. Move the `[Unreleased]` entries in `CHANGELOG.md` into a new
   `## [X.Y.Z] - YYYY-MM-DD` section.
2. Add a compare-link at the bottom of the file.
3. Commit these changes to `main` through a normal PR.

The publish workflow does not touch `CHANGELOG.md`. It only bumps
`package.json`.

For dev releases, **do not update `CHANGELOG.md`** — dev snapshots are
ephemeral and the changelog tracks user-facing stable releases only.

## What the workflow commits back to `main`

| Channel  | Commits version bump to `main`? | Pushes git tag? | Creates GitHub release?     |
| -------- | ------------------------------- | --------------- | --------------------------- |
| `latest` | Yes                             | Yes             | Yes                         |
| `dev`    | **No** (orphan commit + tag)    | Yes             | Yes (marked `--prerelease`) |

Dev releases create a tag pointing at an orphan commit (the package.json
bump made in the CI runner). The orphan commit is reachable through the
tag but is not on any branch, so `main` history stays clean. This is
intentional — dev publishes happen frequently, and committing every
`release: v0.1.0-dev.N` back to `main` would be noise.

## Recovery scenarios

The workflow's steps run in this order: install → typecheck/test/format
check → **verify npm auth** → resolve version → **publish to npm** →
**verify publish landed** → commit/tag/release. Failures get progressively
more dangerous the further down the list they happen, because side effects
accumulate. Recovery procedure depends on which step failed.

### Scenario 1: Failed before `npm publish` (no side effects)

Includes: install, typecheck, test, format check, verify-npm-auth, and
resolve-version steps. Symptoms: `bun install` errors, type errors, test
failures, prettier complaints, `npm whoami` errors, version.ts validation
errors.

**Recovery:** none required. Nothing was published, nothing was committed,
nothing was tagged. Just fix the underlying problem and re-dispatch the
workflow.

The most common subtype here is **bad or missing `NPM_TOKEN`**, surfaced
by the verify-npm-auth step:

```
npm error code ENEEDAUTH
npm error need auth This command requires you to be logged in.
```

Fix: add or update the `NPM_TOKEN` secret in repo settings (see
[AGENTS.md](./AGENTS.md#release-flow) for token requirements), then
re-dispatch. Nothing else to clean up.

### Scenario 2: Publish succeeded but registry verification failed

Symptom: `npm publish` reported success, but the post-publish
**"Verify publish landed on registry"** step fails after 3 retries with:

```
::error::npm publish reported success but VERSION did not appear on the registry after 3 attempts
```

Most likely cause: registry replication lag or a transient registry
issue. The version IS published — `npm view` just isn't seeing it from
the runner's resolved registry mirror yet.

**Recovery:**

1. Wait 1–2 minutes, then verify manually from your machine:

   ```bash
   npm view @kilocode/shell-security@VERSION version
   ```

2. If the version IS on npm now, the publish was real. Manually create
   the tag and GitHub release per **Scenario 4** below — but **only the
   tag/release portion**, not the npm publish portion.

3. If the version is NOT on npm after 5 minutes, the publish actually
   failed and you can re-dispatch. (This case is rare; `npm publish`
   strongly tries not to lie.)

### Scenario 3: Publish + push succeeded, GitHub release creation failed

Symptom: npm has the new version, the git tag is pushed and visible on
GitHub, but the **"Create GitHub release"** step failed with a `gh`
error (rate limit, transient API error, missing permissions).

This leaves a "headless" tag — version is on npm, tag exists on GitHub,
but the GitHub releases page doesn't list the new version.

**Recovery:** create the GitHub release manually from your machine.

```bash
# For stable releases:
gh release create vX.Y.Z \
  --repo Kilo-Org/shell-security \
  --title "vX.Y.Z" \
  --generate-notes

# For dev releases (note --prerelease):
gh release create vX.Y.Z-dev.N \
  --repo Kilo-Org/shell-security \
  --title "vX.Y.Z-dev.N" \
  --generate-notes \
  --prerelease
```

The next dispatch will succeed normally because version.ts's tag-exists
precheck looks at GitHub releases — and the manual `gh release create`
above creates one.

### Scenario 4: Publish succeeded but commit / tag push failed

This is the most dangerous failure mode. Symptom: `npm publish` succeeds
(package is live on npm at the new version) and the verify-publish-landed
step passes, but the workflow fails at the **"Commit version bump (stable
only)"** or **"Tag release"** step with a `remote rejected` error.

Most common cause: `main`'s branch ruleset bypass list does not include
the `kilo-maintainer` GitHub App, or the App's installation token is
expired/revoked. See **Branch protection** below.

Recovery steps:

1. **Do not** re-run the workflow. The package is already published; a
   rerun will fail at the tag-exists precheck (after another version is
   resolved) or at the verify-publish-landed step.

2. **For stable releases**, create the version bump + tag locally and push
   them:

   ```bash
   git checkout main
   git pull
   # Bump package.json manually to the version that was published.
   git add package.json
   git commit -m "release: v1.2.4"
   git tag v1.2.4
   git push origin main --tags
   ```

3. **For dev releases**, create just the tag pointing at an orphan commit:

   ```bash
   git checkout --detach
   # Bump package.json manually to the version that was published.
   git add package.json
   git commit -m "release: v0.1.0-dev.6"
   git tag v0.1.0-dev.6
   git push origin v0.1.0-dev.6
   git checkout main  # IMPORTANT: get back to a real branch before
                      # doing anything else, or your next git operation
                      # will be from detached HEAD and may be lost.
   ```

4. Create the GitHub release manually (same as Scenario 3 above):

   ```bash
   gh release create v1.2.4 \
     --repo Kilo-Org/shell-security \
     --title "v1.2.4" \
     --generate-notes
   # Add --prerelease for dev releases.
   ```

5. Verify the App token, App installation, and bypass list are still
   valid (see **Branch protection** below) before the next release.

## Branch protection

The `Main branch protection` ruleset on `main` (Settings → Rules →
Rulesets) restricts direct pushes. The publish workflow bypasses this
restriction by authenticating as the `kilo-maintainer` GitHub App rather
than the default `github-actions[bot]`. Requirements for this to work:

1. **`kilo-maintainer` App is installed on `Kilo-Org/shell-security`.**
   Verify at Settings → GitHub Apps → Installed GitHub Apps. The App is
   also installed on `Kilo-Org/kilocode`; same App, same credentials.
2. **Two secrets exist in this repo** (or at org level, exposed to this
   repo): `KILO_MAINTAINER_APP_ID` (numeric) and `KILO_MAINTAINER_APP_SECRET`
   (full PEM private key). Regenerating the App's private key requires
   updating `KILO_MAINTAINER_APP_SECRET` in every repo that uses it.
3. **Bypass actor configured on the ruleset.** Settings → Rules →
   `Main branch protection` → **Bypass list** must include the
   `kilo-maintainer` App with bypass mode `Always`. Do NOT add the
   generic `github-actions` app — that would grant bypass to every
   workflow in the repo; the point of using the dedicated app is
   to keep the bypass narrowly scoped to the publish flow.

If a stable publish fails at the push step and all three above are in
place, check the workflow run's `Setup git committer` step output — a
revoked installation or an expired/rotated private key would fail there
rather than at the push.

Dev-channel publishes don't touch `main` (they push only the tag via an
orphan commit), so they don't depend on item 3 above — but they still
need items 1 and 2 for the same token minting flow.

## First publish of a newly-named npm package (OIDC bootstrap)

**When this applies:** the very first publish of a package slug that
doesn't exist on npm yet. Happens once at package creation, and again
if the package is ever renamed (as when `@kilocode/openclaw-security-advisor`
became `@kilocode/shell-security`).

**The chicken-and-egg:** npm trusted publishers (OIDC) can only be
configured on a package that already exists on the registry. Until the
package slug exists, there's nothing to attach trust to. So the very
first publish **must** use a classic npm token, not OIDC. The workflow's
OIDC-based publish step will fail with `401 Unauthorized` or similar.

### One-time manual bootstrap

1. **Get an npm classic automation token** with publish permission for
   the `@kilocode` scope (npmjs.com → avatar → Access Tokens →
   Generate New Token → "Automation" or "Publish").
2. **Publish locally** from a clean checkout of the main branch:

   ```bash
   git checkout main && git pull
   # Edit package.json: remove "private": true AND set "version" to the
   # target, e.g. "0.2.0". Do NOT commit this — it's just for the local
   # publish.
   NPM_CONFIG_PROVENANCE=false npm publish --tag latest --access public \
     --//registry.npmjs.org/:_authToken=$YOUR_CLASSIC_TOKEN
   # Restore private: true and version locally; discard the edit.
   ```

   Provenance must be off on this step — provenance attestation requires
   OIDC, which is exactly what we don't have yet.

3. **Verify on npm:** `npm view @kilocode/shell-security version` should
   return the version you just published.
4. **Create the git tag and GitHub release by hand** so future
   `script/version.ts` runs see it:

   ```bash
   git tag v0.2.0 -m "Release v0.2.0"
   git push origin v0.2.0
   gh release create v0.2.0 --title v0.2.0 --generate-notes --verify-tag
   ```

### Configure OIDC Trusted Publishers (one-time)

Once the package slug exists:

1. On npmjs.com, navigate to the package settings → **Trusted Publishers**.
2. Add a GitHub Actions publisher:
   - Repository owner: `Kilo-Org`
   - Repository name: `shell-security`
   - Workflow file: `publish.yml`
   - Environment: _(leave blank)_
3. Save.

### Subsequent publishes go through the workflow

From the second release onward, the normal `workflow_dispatch` flow in
this document applies — the workflow authenticates to npm via OIDC,
publishes with provenance, and handles git/GitHub-release side effects.
