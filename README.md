# oc-packages

**Reference implementations for the OrangeCheck protocol family.**
_Six verbs. One Bitcoin address. The protocol surface of the sovereign web._

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

This monorepo holds every published `@orangecheck/*` npm package and the
Python `orangecheck` SDK. The protocol family ships as one spec repo per
verb plus one reference site per verb; everything publishable lives here so
packages can tag, release, and version independently of the sites.

| Verb           | Spec                                                                       | Site                                                                                                                |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| identity       | [`oc-attest-protocol`](https://github.com/orangecheck/oc-attest-protocol)  | [`oc-attest-web`](https://github.com/orangecheck/oc-attest-web) → [attest.ochk.io](https://attest.ochk.io)           |
| confidentiality | [`oc-lock-protocol`](https://github.com/orangecheck/oc-lock-protocol)     | [`oc-lock-web`](https://github.com/orangecheck/oc-lock-web) → [lock.ochk.io](https://lock.ochk.io)                   |
| legitimacy     | [`oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol)      | [`oc-vote-web`](https://github.com/orangecheck/oc-vote-web) → [vote.ochk.io](https://vote.ochk.io)                   |
| provenance     | [`oc-stamp-protocol`](https://github.com/orangecheck/oc-stamp-protocol)    | [`oc-stamp-web`](https://github.com/orangecheck/oc-stamp-web) → [stamp.ochk.io](https://stamp.ochk.io)               |
| authority      | [`oc-agent-protocol`](https://github.com/orangecheck/oc-agent-protocol)    | [`oc-agent-web`](https://github.com/orangecheck/oc-agent-web) → [agent.ochk.io](https://agent.ochk.io)               |
| commitment     | [`oc-pledge-protocol`](https://github.com/orangecheck/oc-pledge-protocol)  | [`oc-pledge-web`](https://github.com/orangecheck/oc-pledge-web) → [pledge.ochk.io](https://pledge.ochk.io)           |

The umbrella ([`oc-www`](https://github.com/orangecheck/oc-www) → [ochk.io](https://ochk.io))
hosts the unified docs at [docs.ochk.io](https://docs.ochk.io), the auth host,
the dashboard, and the contact form. Sites consume the packages from npm at
fixed `^x.y.z` ranges — no git submodules in the current canonical pattern,
though a few legacy web repos still carry in-tree `packages/` mirrors during
their migration to pure npm consumption.

---

## Packages

24 published packages across the family — one TypeScript ecosystem on npm and
one Python SDK on PyPI.

### Per-protocol cores

| Path                               | Package                       | Protocol  | Purpose                                                                        |
| ---------------------------------- | ----------------------------- | --------- | ------------------------------------------------------------------------------ |
| [`sdk/`](sdk/)                     | `@orangecheck/sdk`            | Attest    | TypeScript core — `check()`, `verify()`, `createAttestation()`, scoring.        |
| [`sdk-py/`](sdk-py/)               | `orangecheck`                 | Attest    | Python SDK. Same conformance vectors as `@orangecheck/sdk`.                     |
| [`lock-crypto/`](lock-crypto/)     | `@orangecheck/lock-crypto`    | Lock      | Narrow crypto primitives — X25519, HKDF-SHA256, AES-256-GCM.                    |
| [`lock-core/`](lock-core/)         | `@orangecheck/lock-core`      | Lock      | Sealed-envelope format, RFC-8785 canonicalization, `seal()` / `unseal()`.       |
| [`lock-device/`](lock-device/)     | `@orangecheck/lock-device`    | Lock      | Device-key generation, BIP-322 binding, Nostr kind-30078 directory publish.     |
| [`vote-core/`](vote-core/)         | `@orangecheck/vote-core`      | Vote      | Reference impl — `canonicalize`, `pollId`, `voterWeight`, deterministic `tally()`. |
| [`stamp-core/`](stamp-core/)       | `@orangecheck/stamp-core`     | Stamp     | Canonical message + envelope format, `stamp()` / `verify()`.                    |
| [`stamp-ots/`](stamp-ots/)         | `@orangecheck/stamp-ots`      | Stamp     | OpenTimestamps calendar client + pending → confirmed proof upgrade.             |
| [`agent-core/`](agent-core/)       | `@orangecheck/agent-core`     | Agent     | Delegation / action / revocation envelopes, scope grammar, BIP-322 verifier.    |
| [`agent-signer/`](agent-signer/)   | `@orangecheck/agent-signer`   | Agent     | `createDelegation()`, `signAsAgent()`, `revoke()` — wallet plumbing.            |
| [`agent-mcp/`](agent-mcp/)         | `@orangecheck/agent-mcp`      | Agent     | MCP tool-call signer — every LLM tool invocation becomes a signed agent-action. |

> **Pledge:** `@orangecheck/pledge-core` and `@orangecheck/pledge-cli` are
> being extracted from `oc-pledge-web/src/lib/pledge/` into this monorepo for
> separate publish. Until then the canonical-message + envelope code lives
> in source form on the reference site.

### Integrations + middleware

| Path                                 | Package                       | Use when                                                              |
| ------------------------------------ | ----------------------------- | --------------------------------------------------------------------- |
| [`gate/`](gate/)                     | `@orangecheck/gate`           | Drop-in HTTP middleware (Express / Next / Fastify / Hono / Workers).  |
| [`react/`](react/)                   | `@orangecheck/react`          | `<OcBadge>`, `<OcGate>`, `<OcChallengeButton>`.                       |
| [`vote-react/`](vote-react/)         | `@orangecheck/vote-react`     | React components for OC Vote poll creation + tally rendering.         |
| [`wallet-adapter/`](wallet-adapter/) | `@orangecheck/wallet-adapter` | One `sign(message)` API across UniSat / Xverse / Leather / OKX / Phantom. |
| [`auth-client/`](auth-client/)       | `@orangecheck/auth-client`    | `<OcSessionProvider>` + `useOcSession()` for cross-subdomain auth.    |
| [`auth-core/`](auth-core/)           | `@orangecheck/auth-core`      | Crypto-only Ed25519 JWT verify + cookie helpers (consumer side).      |
| [`relay-filter/`](relay-filter/)     | `@orangecheck/relay-filter`   | Sybil filter for Nostr relays (Strfry plugin + framework-agnostic core). |
| [`airdrop-gate/`](airdrop-gate/)     | `@orangecheck/airdrop-gate`   | Filter candidate addresses into a sybil-resistant airdrop allowlist.  |
| [`ui/`](ui/)                         | `@orangecheck/ui`             | Family-internal React UI (the cross-product `EcosystemSwitcher`).      |

### Shells

| Path                       | Package                  | Bin                             |
| -------------------------- | ------------------------ | ------------------------------- |
| [`cli/`](cli/)             | `@orangecheck/cli`       | `oc`                            |
| [`stamp-cli/`](stamp-cli/) | `@orangecheck/stamp-cli` | `stamp`, `git-stamp`            |
| [`vote-cli/`](vote-cli/)   | `@orangecheck/vote-cli`  | `oc-vote`                       |
| [`agent-cli/`](agent-cli/) | `@orangecheck/agent-cli` | `oc-agent`                      |

[`EXAMPLES.md`](EXAMPLES.md) — working integration examples for every framework.

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
