# Releasing `@kilocode/openclaw-security-advisor`

Releases are cut from the `publish` workflow in GitHub Actions. There is no
local release script, no automated release on push, and no changesets tool.
Every release is a manual `workflow_dispatch`.

## Pre-flight checklist

Before clicking "Run workflow", confirm:

- [ ] `main` is green on all three CI workflows (`typecheck`, `test`, `format`).
- [ ] `CHANGELOG.md` has the changes you're about to ship listed under `## [Unreleased]`.
- [ ] You know the exact version number you want to publish.
- [ ] The tag for that version does **not** already exist on
      https://github.com/Kilo-Org/openclaw-security-advisor/releases.
      (The workflow will fail fast if it does, but check first — it's cheaper
      to pick a different number than to recover from a partial publish.)

## Cutting a release

1. Open https://github.com/Kilo-Org/openclaw-security-advisor/actions/workflows/publish.yml
2. Click **Run workflow** (top right).
3. Fill in the inputs (see paths below).
4. Click **Run workflow**.
5. Wait for the job to finish (typically 2–3 minutes).
6. Verify on [npm](https://www.npmjs.com/package/@kilocode/openclaw-security-advisor)
   that the new version shipped with the right dist-tag.
7. Verify on the [GitHub releases page](https://github.com/Kilo-Org/openclaw-security-advisor/releases)
   that the tag and release were created.

### Path A: Explicit version (beta, rc, custom)

Use this for pre-release versions where you want to control the exact number.

| Input         | Value                                          |
| ------------- | ---------------------------------------------- |
| `bump`        | _(leave blank)_                                |
| `version`     | `0.1.0-beta.1` (or whatever you want)          |
| `channel`     | `beta` (or `rc`, `latest`, etc.)               |
| `pre_release` | _(leave unchecked — `channel` wins over this)_ |

Result: publishes exactly `0.1.0-beta.1` to the `beta` npm dist-tag.

### Path B: Auto-bump stable

Use this for normal stable releases. CI queries the highest existing
`vX.Y.Z` tag on the repo, bumps it by the requested component, publishes
to the `latest` dist-tag.

| Input         | Value                          |
| ------------- | ------------------------------ |
| `bump`        | `patch` (or `minor` / `major`) |
| `version`     | _(leave blank)_                |
| `channel`     | _(leave blank)_                |
| `pre_release` | _(leave unchecked)_            |

Result: if the current highest stable is `v1.2.3`, a `patch` bump
publishes `1.2.4` to `latest`.

## After the release

1. Move the `[Unreleased]` entries in `CHANGELOG.md` into a new
   `## [X.Y.Z] - YYYY-MM-DD` section.
2. Add a compare-link at the bottom of the file.
3. Commit these changes to `main` through a normal PR.

_(The workflow does not touch `CHANGELOG.md`. It only bumps `package.json`.)_

## Recovery: push step failed after npm publish succeeded

This is the most dangerous failure mode. Symptom: `npm publish` succeeds
(package is live on npm at the new version) but the workflow fails at the
**"Commit version bump and tag"** step with a `remote rejected` error.

Most common cause: branch protection on `main` does not include
`github-actions[bot]` in the bypass actors list. See **Branch protection**
below.

Recovery steps:

1. **Do not** re-run the workflow. The package is already published; a rerun
   will fail at the tag-exists precheck or, worse, try to republish and fail
   with `EPUBLISHCONFLICT`.
2. Create the version bump + tag locally and push them:
   ```bash
   git checkout main
   git pull
   # Bump package.json manually to the version that was published.
   git add package.json
   git commit -m "release: v0.1.0-beta.1"
   git tag v0.1.0-beta.1
   git push origin main --tags
   ```
3. Create the GitHub release manually:
   ```bash
   gh release create v0.1.0-beta.1 \
     --title "v0.1.0-beta.1" \
     --generate-notes \
     --prerelease   # omit for stable releases
   ```
4. Fix the underlying cause (branch protection bypass) before the next release.

## Branch protection

When branch protection / rulesets are enabled on `main`, the
`github-actions[bot]` actor **must** be added to the ruleset's bypass actors
list. Without it, the publish workflow's final push step fails, triggering
the recovery procedure above.

See [AGENTS.md](./AGENTS.md#branch-protection-and-the-release-commit) for the
longer-term plan to replace the bot bypass with a dedicated GitHub App.

## First-time beta release (2026-04-15)

Today's release is the first ever. There are no prior tags, so auto-bump
(Path B) would resolve to `0.0.0 → 0.0.1`, which is not what we want.
Use **Path A** with:

| Input     | Value          |
| --------- | -------------- |
| `version` | `0.1.0-beta.1` |
| `channel` | `beta`         |

This publishes `@kilocode/openclaw-security-advisor@0.1.0-beta.1` to the
`beta` dist-tag, creates the `v0.1.0-beta.1` tag + prerelease GitHub release,
and commits the version bump to `main`.
