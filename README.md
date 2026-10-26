# oc-packages

**Reference implementations for the OrangeCheck protocol family.**
_Six verbs. One Bitcoin address. The protocol surface of the sovereign web._

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

This monorepo holds every published `@orangecheck/*` npm package and the
Python `orangecheck` SDK. The protocol family ships as one spec repo per
verb plus one reference site per verb; everything publishable lives here so
packages can tag, release, and version independently of the sites.

Specs are public; the reference web clients are closed-source but live on
public subdomains and consume these packages from npm.

| Verb            | Spec                                                                      | Reference site                                            |
| --------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| identity        | [`oc-attest-protocol`](https://github.com/orangecheck/oc-attest-protocol) | [attest.ochk.io](https://attest.ochk.io)                  |
| confidentiality | [`oc-lock-protocol`](https://github.com/orangecheck/oc-lock-protocol)     | [lock.ochk.io](https://lock.ochk.io)                      |
| legitimacy      | [`oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol)     | [vote.ochk.io](https://vote.ochk.io)                      |
| provenance      | [`oc-stamp-protocol`](https://github.com/orangecheck/oc-stamp-protocol)   | [stamp.ochk.io](https://stamp.ochk.io)                    |
| authority       | [`oc-agent-protocol`](https://github.com/orangecheck/oc-agent-protocol)   | [agent.ochk.io](https://agent.ochk.io)                    |
| commitment      | [`oc-pledge-protocol`](https://github.com/orangecheck/oc-pledge-protocol) | [pledge.ochk.io](https://pledge.ochk.io)                  |

The umbrella site at [ochk.io](https://ochk.io) hosts the unified docs at
[ochk.io/docs](https://ochk.io/docs), the auth host, the dashboard, and the
contact form. Sites consume the packages from npm at fixed `^x.y.z` ranges.

---

## Packages

**31 published packages** across the family — 30 TypeScript packages on npm and one Python SDK on PyPI.

> **Full API reference for every package:** [ochk.io/docs/sdk](https://ochk.io/docs/sdk) — auto-generated from the TypeScript source via TypeDoc on every release tag. The READMEs below are short marketing cards; the docs site is the source of truth for every export, type, and signature.

### Per-protocol cores

| Path                               | Package                       | Protocol  | Reference                                                                       |
| ---------------------------------- | ----------------------------- | --------- | ------------------------------------------------------------------------------- |
| [`sdk/`](sdk/)                     | `@orangecheck/sdk`            | Attest    | [ochk.io/docs/sdk/sdk](https://ochk.io/docs/sdk/sdk)                            |
| [`sdk-py/`](sdk-py/)               | `orangecheck` (PyPI)          | Attest    | Same conformance vectors as `@orangecheck/sdk`. Python ref docs deferred.       |
| [`auth-core/`](auth-core/)         | `@orangecheck/auth-core`      | Auth      | [ochk.io/docs/sdk/auth-core](https://ochk.io/docs/sdk/auth-core)                |
| [`auth-client/`](auth-client/)     | `@orangecheck/auth-client`    | Auth      | [ochk.io/docs/sdk/auth-client](https://ochk.io/docs/sdk/auth-client)            |
| [`nostr-core/`](nostr-core/)       | `@orangecheck/nostr-core`     | Family    | [ochk.io/docs/sdk/nostr-core](https://ochk.io/docs/sdk/nostr-core)              |
| [`lock-crypto/`](lock-crypto/)     | `@orangecheck/lock-crypto`    | Lock      | [ochk.io/docs/sdk/lock-crypto](https://ochk.io/docs/sdk/lock-crypto)            |
| [`lock-core/`](lock-core/)         | `@orangecheck/lock-core`      | Lock      | [ochk.io/docs/sdk/lock-core](https://ochk.io/docs/sdk/lock-core)                |
| [`lock-device/`](lock-device/)     | `@orangecheck/lock-device`    | Lock      | [ochk.io/docs/sdk/lock-device](https://ochk.io/docs/sdk/lock-device)            |
| [`vote-core/`](vote-core/)         | `@orangecheck/vote-core`      | Vote      | [ochk.io/docs/sdk/vote-core](https://ochk.io/docs/sdk/vote-core)                |
| [`stamp-core/`](stamp-core/)       | `@orangecheck/stamp-core`     | Stamp     | [ochk.io/docs/sdk/stamp-core](https://ochk.io/docs/sdk/stamp-core)              |
| [`stamp-ots/`](stamp-ots/)         | `@orangecheck/stamp-ots`      | Stamp     | [ochk.io/docs/sdk/stamp-ots](https://ochk.io/docs/sdk/stamp-ots)                |
| [`agent-core/`](agent-core/)       | `@orangecheck/agent-core`     | Agent     | [ochk.io/docs/sdk/agent-core](https://ochk.io/docs/sdk/agent-core)              |
| [`agent-signer/`](agent-signer/)   | `@orangecheck/agent-signer`   | Agent     | [ochk.io/docs/sdk/agent-signer](https://ochk.io/docs/sdk/agent-signer)          |
| [`pledge-core/`](pledge-core/)     | `@orangecheck/pledge-core`    | Pledge    | [ochk.io/docs/sdk/pledge-core](https://ochk.io/docs/sdk/pledge-core)            |
| [`me-client/`](me-client/)         | `@orangecheck/me-client`      | me.ochk.io| [ochk.io/docs/sdk/me-client](https://ochk.io/docs/sdk/me-client)                |

### Integrations + middleware

| Path                                 | Package                       | Use when                                                                  |
| ------------------------------------ | ----------------------------- | ------------------------------------------------------------------------- |
| [`gate/`](gate/)                     | `@orangecheck/gate`           | Drop-in HTTP middleware (Express / Next / Fastify / Hono).                |
| [`react/`](react/)                   | `@orangecheck/react`          | `<OcBadge>`, `<OcGate>`, `<OcChallengeButton>`.                            |
| [`vote-react/`](vote-react/)         | `@orangecheck/vote-react`     | React components for OC Vote poll creation + tally rendering.             |
| [`wallet-adapter/`](wallet-adapter/) | `@orangecheck/wallet-adapter` | One `sign(message)` API across UniSat / Xverse / Leather / OKX / Phantom. |
| [`relay-filter/`](relay-filter/)     | `@orangecheck/relay-filter`   | Sybil filter for Nostr relays (Strfry plugin + framework-agnostic core).  |
| [`airdrop-gate/`](airdrop-gate/)     | `@orangecheck/airdrop-gate`   | Filter candidate addresses into a sybil-resistant airdrop allowlist.      |
| [`webhook-verify/`](webhook-verify/) | `@orangecheck/webhook-verify` | HMAC verification helpers for OC webhook deliveries.                      |
| [`agent-mcp/`](agent-mcp/)           | `@orangecheck/agent-mcp`      | Model Context Protocol bindings for agent envelopes.                      |
| [`agent-anthropic/`](agent-anthropic/) | `@orangecheck/agent-anthropic` | Adapter for Anthropic SDK tool-use canonicalization.                  |
| [`agent-openai/`](agent-openai/)     | `@orangecheck/agent-openai`   | Adapter for OpenAI SDK tool-call canonicalization.                        |
| [`agent-langgraph/`](agent-langgraph/) | `@orangecheck/agent-langgraph` | Adapter for LangGraph tool-call canonicalization.                     |
| [`agent-vercel/`](agent-vercel/)     | `@orangecheck/agent-vercel`   | Adapter for Vercel AI SDK tool-call canonicalization.                     |
| [`ui/`](ui/)                         | `@orangecheck/ui`             | Family-internal React UI (the cross-product `EcosystemSwitcher`).         |
| [`legal/`](legal/)                   | `@orangecheck/legal`          | Family-internal Terms / Privacy document engine for the `.ochk.io` sites. |
| [`site-kit/`](site-kit/)             | `@orangecheck/site-kit`       | Family-internal site scaffolding: SEO, headers and CSP, `/api/auth/me`, OG, sitemap. |

### Shells (CLIs — not on the docs site)

| Path                       | Package                  | Bin                             |
| -------------------------- | ------------------------ | ------------------------------- |
| [`cli/`](cli/)             | `@orangecheck/cli`       | `oc`                            |
| [`stamp-cli/`](stamp-cli/) | `@orangecheck/stamp-cli` | `stamp`, `git-stamp`            |
| [`vote-cli/`](vote-cli/)   | `@orangecheck/vote-cli`  | `oc-vote`                       |
| [`agent-cli/`](agent-cli/) | `@orangecheck/agent-cli` | `oc-agent`                      |

[`EXAMPLES.md`](EXAMPLES.md) — working integration examples for every framework.

---

## Documentation strategy

Per-package READMEs are intentionally short. Full API reference (every export, type, and signature) is auto-generated from the TypeScript source via [TypeDoc](https://typedoc.org/) on every release and published to [ochk.io/docs/sdk](https://ochk.io/docs/sdk).

Discipline:

- **TSDoc comments in `src/*.ts` are the source of truth.** Anyone updating documentation edits the `.ts` file. The docs site updates on the next release.
- **Per-package READMEs are short.** Tagline + install + 30-second example + a banner pointing to `ochk.io/docs/sdk/<pkg>`. Detailed API surface lives only on the docs site.
- **Hand-written narrative is in [`oc-docs`](https://github.com/orangecheck/oc-docs).** Conceptual pages, quickstarts, "why this protocol" prose. The auto-generated `/sdk/*` reference complements that hand-written `/<verb>/*` content.
- **CI gates drift.** A drift-check workflow regenerates docs in CI on every PR and uploads the diff as an artifact (advisory). The release workflow opens an auto-PR in `oc-docs` on every `<pkg>-v*` tag, so the docs site stays in lock-step with published versions automatically.

Local commands:
```bash
yarn install               # install root + per-package devDeps
yarn docs:gen <pkg>        # regenerate one package's docs (writes ../oc-docs/src/pages/sdk/<pkg>/)
yarn docs:gen:all          # regenerate every package
yarn docs:check            # exit 1 if regenerated docs would differ from committed oc-docs
```

---

## Local development

Each package is independent and ships its own `node_modules` + `yarn.lock`.
Build a single package:

```bash
cd sdk  && yarn install && yarn build
cd gate && yarn install && yarn build
# …
```

Dependency build order (enforced in CI):

- `sdk` — build before `gate`, `cli`, `react`, `wallet-adapter`, `relay-filter`, `airdrop-gate`
- `lock-crypto` — build before `lock-core` and `lock-device`
- `stamp-core` — build before `stamp-ots` and `agent-core`
- `agent-core` — build before `agent-signer`, `agent-mcp`, and `agent-cli`
- `agent-signer` — build before `agent-mcp`
- `auth-core` — build before `auth-client`

The `packages.yml` CI workflow enforces this ordering.

---

## Releases

A change reaches main only through its merge queue: `bash scripts/land.sh <branch>`
opens the PR, queues it, and returns once main holds it. The queue rebases, so
main's commits are not the branch's. Tag the newest commit on main that touches
the package, not the one that changed its version: a branch can carry more
commits for the package after the bump. Check that its `package.json` carries
the version and that the package is exactly the tree that was reviewed, wait for
its checks to be green (the queue's run on that commit counts; a later push to
main can cancel the push run), and push the tag by name. If another lane changed
the package after yours landed, the diff shows it: that change needs its own
version bump and review before a tag.

```bash
git fetch origin
sha=$(git log -1 --format=%H origin/main -- sdk)
git show "$sha:sdk/package.json" | grep '"version"'   # must print 0.2.0
git diff <reviewed branch tip> "$sha" -- sdk           # must print nothing
git tag sdk-v0.2.0 "$sha" && git push origin sdk-v0.2.0
```

Each tag takes the canonical form `<pkg>-v<version>`:

```text
sdk-v0.2.0             → @orangecheck/sdk
gate-v0.1.5            → @orangecheck/gate
cli-v0.3.0             → @orangecheck/cli
react-v0.2.0           → @orangecheck/react
wallet-adapter-v0.1.0  → @orangecheck/wallet-adapter
relay-filter-v0.1.1    → @orangecheck/relay-filter
airdrop-gate-v0.1.1    → @orangecheck/airdrop-gate
auth-core-v0.1.0       → @orangecheck/auth-core
auth-client-v0.1.0     → @orangecheck/auth-client
ui-v0.1.0              → @orangecheck/ui
sdk-py-v0.1.0          → orangecheck (PyPI)
lock-crypto-v0.1.0     → @orangecheck/lock-crypto
lock-core-v0.1.0       → @orangecheck/lock-core
lock-device-v0.1.0     → @orangecheck/lock-device
vote-core-v0.1.0       → @orangecheck/vote-core
vote-cli-v0.1.0        → @orangecheck/vote-cli
vote-react-v0.1.0      → @orangecheck/vote-react
stamp-core-v0.1.0      → @orangecheck/stamp-core
stamp-ots-v0.1.0       → @orangecheck/stamp-ots
stamp-cli-v0.1.0       → @orangecheck/stamp-cli
agent-core-v0.1.0      → @orangecheck/agent-core
agent-signer-v0.1.0    → @orangecheck/agent-signer
agent-mcp-v0.1.0       → @orangecheck/agent-mcp
agent-cli-v0.1.0       → @orangecheck/agent-cli
```

The `release.yml` workflow picks up the tag, parses the package name and
version, verifies `package.json` (or `pyproject.toml`) matches, builds, and
publishes with provenance.

Required secrets:

- `NPM_TOKEN` — for JS packages
- PyPI uses OIDC trusted publishing — no token needed

---

## Protocol specs

Each protocol's normative specification lives in its own `oc-*-protocol`
repo under [github.com/orangecheck](https://github.com/orangecheck), licensed
MIT. Implementations
in this monorepo MUST pass the spec's conformance vectors byte-identically.
A bug report about divergence between a spec and an implementation belongs
in the relevant `oc-*-protocol` issue tracker.

| Protocol | Spec repo                                                                        |
| -------- | -------------------------------------------------------------------------------- |
| Attest   | [`oc-attest-protocol`](https://github.com/orangecheck/oc-attest-protocol)        |
| Lock     | [`oc-lock-protocol`](https://github.com/orangecheck/oc-lock-protocol)            |
| Vote     | [`oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol)            |
| Stamp    | [`oc-stamp-protocol`](https://github.com/orangecheck/oc-stamp-protocol)          |
| Agent    | [`oc-agent-protocol`](https://github.com/orangecheck/oc-agent-protocol)          |
| Pledge   | [`oc-pledge-protocol`](https://github.com/orangecheck/oc-pledge-protocol)        |

---

## License

All code in this repository is MIT-licensed. See [LICENSE](LICENSE).
