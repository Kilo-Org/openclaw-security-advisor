# @kilocode/shell-security

> **Renamed from `@kilocode/openclaw-security-advisor`.** If you had the
> old plugin installed, see the migration steps below.

An [OpenClaw](https://openclaw.ai) plugin that runs a security checkup of
your OpenClaw instance and returns an expert analysis report from
KiloCode cloud.

The plugin takes the output of `openclaw security audit`, sends it to
the KiloCode ShellSecurity API for analysis, and returns a detailed
markdown report with findings, risks, prioritized recommendations, and
concrete remediation guidance, displayed directly in your chat.

---

## Install

```bash
openclaw plugins install @kilocode/shell-security
openclaw plugins enable shell-security
openclaw gateway restart
```

### Migrating from `@kilocode/openclaw-security-advisor`

```bash
openclaw plugins install @kilocode/shell-security
openclaw plugins enable shell-security
openclaw gateway restart
openclaw plugins uninstall openclaw-security-advisor
```

Device auth runs fresh on the new plugin — you'll be prompted to reconnect
your KiloCode account on first use. Subsequent checkups are identical to
what you got before the rename.

> **If you had the old tool explicitly allow-listed in `tools.alsoAllow`,
> update it.** The tool name changed from `kilocode_security_advisor` to
> `kilocode_shell_security`. If your `openclaw.json` has an entry like
> `tools.alsoAllow: ["kilocode_security_advisor"]`, replace it with
> `kilocode_shell_security` or the new tool won't be offered to the LLM
> for natural-language invocation (the `/shell-security` slash command
> still works regardless). Check with
> `openclaw config get tools.alsoAllow`. If you never set
> `tools.alsoAllow` yourself, there's nothing to change.

On first use, the plugin will walk you through a one-time device auth
flow to connect your KiloCode account.

### Channels

The plugin ships on two npm dist-tags:

- **`latest`** — stable releases (`X.Y.Z`). Default for plain
  `npm install` / `openclaw plugins install`.
- **`dev`** — prerelease snapshots (`X.Y.Z-dev.N`) published ahead of
  stable cuts for early testing. Install with:

  ```bash
  openclaw plugins install @kilocode/shell-security@dev
  # or
  npm install @kilocode/shell-security@dev
  ```

  Dev releases are real npm publishes with the same provenance
  attestation as stable releases (verify with `npm audit signatures`).

You can also install an exact version directly:

```bash
openclaw plugins install @kilocode/shell-security@0.2.0
```

### Staying up to date

New versions ship regularly. To check the latest published stable:

```bash
npm view @kilocode/shell-security version
```

Compare that against the `pluginVersion` line at the end of any security
checkup report. To upgrade:

```bash
openclaw plugins install @kilocode/shell-security
openclaw gateway restart
```

Your security checkup report will occasionally include an inline
"stay current" tip at the bottom with these same commands — a gentle
periodic nudge, not every run. The reminder is appended to the report
markdown itself, so it appears on both invocation paths (the
`/shell-security` slash command and the natural-language
`kilocode_shell_security` tool). Security advice improves as the
plugin ships new audit signals, so staying current is worthwhile.

---

## Usage

The plugin exposes two entry points. They do the same thing; pick whichever
fits your workflow.

### `/shell-security` (recommended)

Type it in chat:

```
/shell-security
```

This is a slash command. It runs the plugin directly and renders the
full report, bypassing the agent's summarization layer entirely. **Use
this for guaranteed verbatim output.**

> **Legacy alias:** `/security-checkup` is also registered and works
> identically. Existing users migrating from
> `@kilocode/openclaw-security-advisor` can keep typing the command
> they're used to.

> **Channel compatibility:** `/shell-security` (and its
> `/security-checkup` alias) work in the OpenClaw native control UI
> chat and in Telegram. They do **not** currently work in Kilo Chat or
> Slack — those surfaces don't route slash commands to OpenClaw plugins.
> In Kilo Chat and Slack, use the natural-language invocation below
> instead; the agent will call the `kilocode_shell_security` tool
> directly.

### Natural language

You can also just ask the agent:

> Run a KiloCode security checkup

> Check my OpenClaw security

> Audit my OpenClaw config

The agent will call the `kilocode_shell_security` tool and the report
will appear in chat.

**Heads up:** natural language invocation goes through your configured
language model on two fronts — it has to pick the right tool from your
natural-language request, and then render the tool's output. Small
summarizing models (e.g. GPT-4.1-nano, Haiku) often fail on both:

1. **Tool selection.** Asking "run the shell security plugin" on a
   small model frequently results in the model claiming no such tool
   exists, even when `kilocode_shell_security` is registered and
   allow-listed. Capable models (GPT-4o, Claude Sonnet, Gemini Pro)
   match reliably against the tool description.
2. **Report rendering.** Even when the tool is invoked, small models
   tend to paraphrase the markdown down to a few sentences instead of
   rendering the full report verbatim.

**If you're running a small or summarizing model, use the
`/shell-security` slash command for deterministic invocation** (where
supported — see channel compatibility above). The slash command
bypasses the LLM entirely, so it doesn't need to pick the tool and
can't paraphrase the report.

---

## First run authentication

The first time you run the checkup, you'll be prompted to connect your
KiloCode account:

```
## Connect to KiloCode

To run a security checkup, connect your KiloCode account.

1. Open this URL in your browser:
   https://app.kilo.ai/openclaw-advisor?code=XXXX-XXXX

2. Enter this code: XXXX-XXXX

3. Sign in or create a free account

Once you've approved the connection, run the security checkup again.
```

Open the URL, sign in (or create a free account), and approve the
connection. Then run `/shell-security` again. The plugin will pick
up the approval, persist your auth token, run the checkup, and return
the report in the same response.

For every run after the first, no auth prompt appears. The saved token
is reused automatically.

---

## What gets sent

The plugin sends the following to the KiloCode ShellSecurity API:

- The JSON output of `openclaw security audit` (local config audit
  results, with no secrets, no file contents, just finding IDs and
  summaries)
- Your OpenClaw version and plugin version
- The public IP address of your instance (used for optional remote
  probes)

The plugin **does not** send:

- Your OpenClaw config file contents
- Secrets, tokens, or API keys
- Conversation history or chat data
- Files from your workspace

All requests are authenticated with your KiloCode account token over
HTTPS.

---

## Configuration

The plugin reads its config from `openclaw.json` under
`plugins.entries.shell-security.config`. In most cases, you
won't need to set anything. The defaults work out of the box.

| Field        | Default                | Purpose                                                                 |
| ------------ | ---------------------- | ----------------------------------------------------------------------- |
| `authToken`  | _(set by device auth)_ | Your KiloCode auth token. Managed automatically by the plugin.          |
| `apiBaseUrl` | `https://api.kilo.ai`  | KiloCode API base URL. Override only if you run a self-hosted KiloCode. |

To override via the OpenClaw CLI:

```bash
openclaw config set plugins.entries.shell-security.config.apiBaseUrl https://your-kilocode.example.com
```

### Environment variables

The plugin also respects these environment variables, useful for
non-interactive setups (CI, containerized deployments):

- `KILOCODE_API_KEY` (alias: `KILO_API_KEY`): if set, the plugin uses
  this as the auth token and skips the device auth flow entirely.
  Intended for environments where an operator has already injected the
  key at boot.
- `KILO_API_URL` or `KILOCODE_API_BASE_URL`: override the API base URL
  without touching the plugin config.

Plugin config takes precedence over env vars; env vars take precedence
over the default.

---

## Troubleshooting

**"Your KiloCode authentication has expired"**
The plugin automatically clears expired tokens and reruns the device
auth flow on the next invocation. Just run `/shell-security` again.

**"Security analysis failed: Rate limit exceeded"**
The KiloCode API rate limits security checkups per account. Wait a
little and try again.

**Natural language invocation paraphrases the report**
This is a limitation of small summarizing language models, not the
plugin. Use `/shell-security` (the slash command) to bypass the model
entirely and render the full report.

**Plugin doesn't appear in `/plugins list`**
The `/plugins` slash command in OpenClaw chat is gated by a separate
OpenClaw setting. To enable it:

```bash
openclaw config set commands.plugins true
openclaw gateway restart
```

The plugin itself works without this setting. It's only needed if you
want the `/plugins list` chat command to show installed plugins.

---

## Contributing

- [`AGENTS.md`](https://github.com/Kilo-Org/shell-security/blob/main/AGENTS.md) — build, test, lint, code layout, and contribution rules.
- [`RELEASING.md`](https://github.com/Kilo-Org/shell-security/blob/main/RELEASING.md) — how to cut a release.
- [`CHANGELOG.md`](https://github.com/Kilo-Org/shell-security/blob/main/CHANGELOG.md) — release history.

---

## License

MIT
