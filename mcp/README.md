# `@orangecheck/mcp`

**The orangecheck MCP server.** Your coding agent reads the orangecheck docs, checks a deployed site against the sign-in checklist, reads a project's public config, and assembles the integration steps for your stack, with every code block copied from the docs page it cites.

It runs on your machine over stdio. It needs no credential and changes nothing in any account.

```bash
claude mcp add orangecheck -- npx -y @orangecheck/mcp
```

Then ask: _"Add sign in with orangecheck to this Next.js app"_, or _"Is https://yourapp.example ready for real people to sign in?"_

Docs: [ochk.io/docs/integration/mcp](https://ochk.io/docs/integration/mcp). Node 20.18.1 or later.

---

## Add it to your client

Every client starts the same command: `npx -y @orangecheck/mcp`.

### Claude Code

```bash
claude mcp add orangecheck -- npx -y @orangecheck/mcp
# for everyone working in this repository (writes .mcp.json):
claude mcp add --scope project orangecheck -- npx -y @orangecheck/mcp
```

### Claude Desktop

In `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "orangecheck": { "command": "npx", "args": ["-y", "@orangecheck/mcp"] }
  }
}
```

### Cursor

In `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "orangecheck": { "command": "npx", "args": ["-y", "@orangecheck/mcp"] }
  }
}
```

### VS Code

In `.vscode/mcp.json`:

```json
{
  "servers": {
    "orangecheck": { "type": "stdio", "command": "npx", "args": ["-y", "@orangecheck/mcp"] }
  }
}
```

### Windsurf

In `~/.codeium/windsurf/mcp_config.json`, the same `mcpServers` block as Cursor.

### Codex CLI

In `~/.codex/config.toml`:

```toml
[mcp_servers.orangecheck]
command = "npx"
args = ["-y", "@orangecheck/mcp"]
```

### Any other client

Any MCP client that starts a stdio server works: the command is `npx`, the arguments `-y @orangecheck/mcp`. To try the tools by hand:

```bash
npx @modelcontextprotocol/inspector npx -y @orangecheck/mcp
```

---

## Tools

All seven are read-only.

| Tool | What it does |
| --- | --- |
| `search_docs` | Full-text search over every written docs page (`ochk.io/docs/llms-full.txt`) and the SDK reference titles. Returns the best pages, their URLs and the matching lines, each with its section anchor. |
| `list_docs` | Every docs page with its one-line description, from `ochk.io/docs/llms.txt`, grouped by section. Takes an optional section (`me`, `integration`, `sdk`, `Optional`). |
| `read_doc` | One page as markdown, or one section of it. Takes a URL or a path, with or without `#anchor`. Long pages come in parts. Reads only `https://ochk.io/docs`. |
| `get_project_config` | Everything me.ochk.io publishes about a project, by its key: name, domain and whether it is verified, frozen, who can sign in, sign-in from apps, and the published prices, pay periods and release schedules. |
| `check_domain_verification` | Reads what me.ochk.io's domain check reads: the TXT record `oc-verify=<token>` and the `<meta name="oc-domain-verify">` tag on `https://<domain>/`. With the token, says whether it is published; without, lists what is. |
| `check_setup` | Runs the quickstart's "check it before real people sign in" against a deployed site, as far as it can be seen from outside: HTTPS, `http://` redirecting, www and the apex ending on one origin (your audience), the Cross-Origin-Opener-Policy the popup needs, domain verification, and with a project key, that the site is on the project's domain. Then lists, verbatim, the checklist items only your code can show. |
| `integration_guide` | The steps for a stack, assembled from the docs as they read now: `nextjs-pages`, `nextjs-app`, `express`, `hono`, `python`, `godot`. Every code block is copied from the page cited above it, never generated. Where the docs have no example (the App Router, a Python cookie route), a "Note" says so instead of inventing one. If the docs change and an excerpt is gone, the guide says which and where to read. |

## Resources

- `orangecheck://docs/llms.txt`: the docs index.
- `orangecheck://docs/{route}`: any docs page as markdown, e.g. `orangecheck://docs/me/quickstart`.

## Prompts

- `set_up_sign_in` (`stack`, optional `site`, `project_key`): walk the quickstart for a stack, then check the deployed site.
- `pre_launch_check` (`site`, optional `project_key`): run `check_setup`, then walk the checklist against your code.

---

## What it reaches

- `https://ochk.io/docs`: `llms.txt`, `llms-full.txt` and each page's `.md` copy, kept for ten minutes.
- `https://me.ochk.io/api/integrator/…`: a project's public endpoints (config, identity, sign-in, native). They need no credential; a project key is not a secret.
- `https://cloudflare-dns.com/dns-query`: the TXT lookup, as me.ochk.io makes it.
- The site you name, for `check_setup` and `check_domain_verification`. It refuses IP addresses, and any host that resolves to a private or local address, and connects only to the addresses it checked. It follows a redirect only to the same domain or its www twin.

Each request carries `User-Agent: orangecheck-mcp/<version>`. Nothing else is sent anywhere: no telemetry, no account, no key.

Managing your account and projects from the agent (a scoped, revocable token you approve in the browser) is planned, not in this version.

---

## Develop

```bash
yarn install
yarn build          # dist/cli.js
yarn type-check
yarn test           # every tool against recorded answers of the real endpoints
OC_MCP_LIVE_PROJECT_KEY=pk_test_… OC_MCP_LIVE_SITE=https://yourapp.example yarn test:live
node scripts/stdio-smoke.mjs [project_key] [site]   # the built server over stdio, every tool, live
node scripts/record-fixtures.mjs [project_key]      # re-record the fixtures; the key is scrubbed
```

## License

MIT. See [LICENSE](./LICENSE).
