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
[docs.ochk.io](https://docs.ochk.io), the auth host, the dashboard, and the
contact form. Sites consume the packages from npm at fixed `^x.y.z` ranges.

---

## Packages

**31 published packages** across the family — 30 TypeScript packages on npm and one Python SDK on PyPI.

> **Full API reference for every package:** [docs.ochk.io/sdk](https://docs.ochk.io/sdk) — auto-generated from the TypeScript source via TypeDoc on every release tag. The READMEs below are short marketing cards; the docs site is the source of truth for every export, type, and signature.

### Per-protocol cores

| Path                               | Package                       | Protocol  | Reference                                                                       |
| ---------------------------------- | ----------------------------- | --------- | ------------------------------------------------------------------------------- |
| [`sdk/`](sdk/)                     | `@orangecheck/sdk`            | Attest    | [docs.ochk.io/sdk/sdk](https://docs.ochk.io/sdk/sdk)                            |
| [`sdk-py/`](sdk-py/)               | `orangecheck` (PyPI)          | Attest    | Same conformance vectors as `@orangecheck/sdk`. Python ref docs deferred.       |
| [`auth-core/`](auth-core/)         | `@orangecheck/auth-core`      | Auth      | [docs.ochk.io/sdk/auth-core](https://docs.ochk.io/sdk/auth-core)                |
| [`auth-client/`](auth-client/)     | `@orangecheck/auth-client`    | Auth      | [docs.ochk.io/sdk/auth-client](https://docs.ochk.io/sdk/auth-client)            |
| [`nostr-core/`](nostr-core/)       | `@orangecheck/nostr-core`     | Family    | [docs.ochk.io/sdk/nostr-core](https://docs.ochk.io/sdk/nostr-core)              |
| [`lock-crypto/`](lock-crypto/)     | `@orangecheck/lock-crypto`    | Lock      | [docs.ochk.io/sdk/lock-crypto](https://docs.ochk.io/sdk/lock-crypto)            |
| [`lock-core/`](lock-core/)         | `@orangecheck/lock-core`      | Lock      | [docs.ochk.io/sdk/lock-core](https://docs.ochk.io/sdk/lock-core)                |
| [`lock-device/`](lock-device/)     | `@orangecheck/lock-device`    | Lock      | [docs.ochk.io/sdk/lock-device](https://docs.ochk.io/sdk/lock-device)            |
| [`vote-core/`](vote-core/)         | `@orangecheck/vote-core`      | Vote      | [docs.ochk.io/sdk/vote-core](https://docs.ochk.io/sdk/vote-core)                |
| [`stamp-core/`](stamp-core/)       | `@orangecheck/stamp-core`     | Stamp     | [docs.ochk.io/sdk/stamp-core](https://docs.ochk.io/sdk/stamp-core)              |
| [`stamp-ots/`](stamp-ots/)         | `@orangecheck/stamp-ots`      | Stamp     | [docs.ochk.io/sdk/stamp-ots](https://docs.ochk.io/sdk/stamp-ots)                |
| [`agent-core/`](agent-core/)       | `@orangecheck/agent-core`     | Agent     | [docs.ochk.io/sdk/agent-core](https://docs.ochk.io/sdk/agent-core)              |
| [`agent-signer/`](agent-signer/)   | `@orangecheck/agent-signer`   | Agent     | [docs.ochk.io/sdk/agent-signer](https://docs.ochk.io/sdk/agent-signer)          |
| [`pledge-core/`](pledge-core/)     | `@orangecheck/pledge-core`    | Pledge    | [docs.ochk.io/sdk/pledge-core](https://docs.ochk.io/sdk/pledge-core)            |
| [`me-client/`](me-client/)         | `@orangecheck/me-client`      | me.ochk.io| [docs.ochk.io/sdk/me-client](https://docs.ochk.io/sdk/me-client)                |

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

Per-package READMEs are intentionally short. Full API reference (every export, type, and signature) is auto-generated from the TypeScript source via [TypeDoc](https://typedoc.org/) on every release and published to [docs.ochk.io/sdk](https://docs.ochk.io/sdk).

Discipline:

- **TSDoc comments in `src/*.ts` are the source of truth.** Anyone updating documentation edits the `.ts` file. The docs site updates on the next release.
- **Per-package READMEs are short.** Tagline + install + 30-second example + a banner pointing to `docs.ochk.io/sdk/<pkg>`. Detailed API surface lives only on the docs site.
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

Tag the commit with the canonical form `<pkg>-v<version>`:

```bash
git tag sdk-v0.2.0           && git push --tags   # → @orangecheck/sdk
git tag gate-v0.1.5          && git push --tags   # → @orangecheck/gate
git tag cli-v0.3.0           && git push --tags   # → @orangecheck/cli
git tag react-v0.2.0         && git push --tags   # → @orangecheck/react
git tag wallet-adapter-v0.1.0 && git push --tags  # → @orangecheck/wallet-adapter
git tag relay-filter-v0.1.1  && git push --tags   # → @orangecheck/relay-filter
git tag airdrop-gate-v0.1.1  && git push --tags   # → @orangecheck/airdrop-gate
git tag auth-core-v0.1.0     && git push --tags   # → @orangecheck/auth-core
git tag auth-client-v0.1.0   && git push --tags   # → @orangecheck/auth-client
git tag ui-v0.1.0            && git push --tags   # → @orangecheck/ui
git tag sdk-py-v0.1.0        && git push --tags   # → orangecheck (PyPI)
git tag lock-crypto-v0.1.0   && git push --tags   # → @orangecheck/lock-crypto
git tag lock-core-v0.1.0     && git push --tags   # → @orangecheck/lock-core
git tag lock-device-v0.1.0   && git push --tags   # → @orangecheck/lock-device
git tag vote-core-v0.1.0     && git push --tags   # → @orangecheck/vote-core
git tag vote-cli-v0.1.0      && git push --tags   # → @orangecheck/vote-cli
git tag vote-react-v0.1.0    && git push --tags   # → @orangecheck/vote-react
git tag stamp-core-v0.1.0    && git push --tags   # → @orangecheck/stamp-core
git tag stamp-ots-v0.1.0     && git push --tags   # → @orangecheck/stamp-ots
git tag stamp-cli-v0.1.0     && git push --tags   # → @orangecheck/stamp-cli
git tag agent-core-v0.1.0    && git push --tags   # → @orangecheck/agent-core
git tag agent-signer-v0.1.0  && git push --tags   # → @orangecheck/agent-signer
git tag agent-mcp-v0.1.0     && git push --tags   # → @orangecheck/agent-mcp
git tag agent-cli-v0.1.0     && git push --tags   # → @orangecheck/agent-cli
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
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Implementations
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
