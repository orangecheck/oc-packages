# oc-packages

**OrangeCheck SDK and integration packages.**
*Sats as signal. No KYC, no custody.*

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

This repository hosts the published OrangeCheck packages. The full protocol
family is split across one spec repo per verb and one reference site per
verb, all consuming this monorepo as a git submodule at `packages/`:

| Verb | Spec | Site |
|---|---|---|
| identity | [`oc-attest-protocol`](https://github.com/orangecheck/oc-attest-protocol) | [`oc-attest-web`](https://github.com/orangecheck/oc-attest-web) → attest.ochk.io |
| confidentiality | [`oc-lock-protocol`](https://github.com/orangecheck/oc-lock-protocol) | [`oc-lock-web`](https://github.com/orangecheck/oc-lock-web) → lock.ochk.io |
| legitimacy | [`oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol) | [`oc-vote-web`](https://github.com/orangecheck/oc-vote-web) → vote.ochk.io |
| provenance | [`oc-stamp-protocol`](https://github.com/orangecheck/oc-stamp-protocol) | [`oc-stamp-web`](https://github.com/orangecheck/oc-stamp-web) → stamp.ochk.io |
| authority | [`oc-agent-protocol`](https://github.com/orangecheck/oc-agent-protocol) | [`oc-agent-web`](https://github.com/orangecheck/oc-agent-web) → agent.ochk.io |

> Sites consume this repo as a git submodule at `packages/`. The split
> exists so packages can tag, release, and version independently of the
> sites.

---

## Packages

| Path | Package | Purpose |
|---|---|---|
| [`sdk/`](sdk/) | `@orangecheck/sdk` | Core TypeScript SDK — `check()`, `verify()`, `createAttestation()`. |
| [`gate/`](gate/) | `@orangecheck/gate` | Drop-in middleware for Express / Next / Fastify / Hono / Workers. |
| [`cli/`](cli/) | `@orangecheck/cli` | `oc` command — `check / verify / discover / challenge`. |
| [`react/`](react/) | `@orangecheck/react` | `<OcBadge>`, `<OcGate>`, `<OcChallengeButton>`. |
| [`wallet-adapter/`](wallet-adapter/) | `@orangecheck/wallet-adapter` | Signer adapters for UniSat, Xverse, Leather, Alby, Sparrow. |
| [`relay-filter/`](relay-filter/) | `@orangecheck/relay-filter` | Sybil filter for Nostr relays (Strfry plugin + framework-agnostic core). |
| [`airdrop-gate/`](airdrop-gate/) | `@orangecheck/airdrop-gate` | Turn a candidate list into a sybil-resistant airdrop allowlist. |
| [`sdk-py/`](sdk-py/) | `orangecheck` | Python SDK. |
| [`lock-crypto/`](lock-crypto/) | `@orangecheck/lock-crypto` | X25519 / HKDF / AES-GCM primitives for OC Lock. |
| [`lock-core/`](lock-core/) | `@orangecheck/lock-core` | OC Lock envelope format, `seal()`, `unseal()`. |
| [`lock-device/`](lock-device/) | `@orangecheck/lock-device` | OC Lock device keys + Nostr kind-30078 directory. |
| [`vote-core/`](vote-core/) | `@orangecheck/vote-core` | OC Vote poll / ballot / tally envelopes. |
| [`vote-cli/`](vote-cli/) | `@orangecheck/vote-cli` | `oc-vote` command — create / cast / tally polls. |
| [`stamp-core/`](stamp-core/) | `@orangecheck/stamp-core` | OC Stamp canonical message, envelope format, `stamp()` / `verify()`. |
| [`stamp-ots/`](stamp-ots/) | `@orangecheck/stamp-ots` | OpenTimestamps calendar submission, proof parsing, pending → confirmed upgrade. |
| [`agent-core/`](agent-core/) | `@orangecheck/agent-core` | OC Agent envelopes (delegation / action / revocation), scope grammar, verification. |
| [`agent-signer/`](agent-signer/) | `@orangecheck/agent-signer` | `createDelegation()`, `signAsAgent()`, `revoke()` — wallet plumbing on top of `agent-core`. |
| [`agent-mcp/`](agent-mcp/) | `@orangecheck/agent-mcp` | Stamp every MCP tool invocation as a signed `agent-action`. |
| [`agent-cli/`](agent-cli/) | `@orangecheck/agent-cli` | `oc-agent` shell — verify, inspect, canonicalize, and reason about envelopes. |
| [`EXAMPLES.md`](EXAMPLES.md) | — | Working integration examples for every framework. |

All Node packages are `MIT`. The Python SDK is `MIT`. The protocol spec
(in `oc-web/docs/oc-protocol/`) is `CC-BY-4.0`.

---

## Local development

```bash
# Each package is independent. Install + build a single package:
cd sdk  && yarn install && yarn build
cd gate && yarn install && yarn build
# …
```

Dependency roots:
- `sdk` — build before `gate`, `cli`, `react`, `wallet-adapter`, `relay-filter`, `airdrop-gate`
- `lock-crypto` — build before `lock-core` and `lock-device`
- `stamp-core` — build before `stamp-ots` and `agent-core`
- `agent-core` — build before `agent-signer`, `agent-mcp`, and `agent-cli`
- `agent-signer` — build before `agent-mcp`

The `packages.yml` CI workflow enforces this ordering.

---

## Releases

Tag the commit with the canonical form `<pkg>-v<version>`:

```bash
git tag sdk-v0.2.0          && git push --tags   # → @orangecheck/sdk
git tag gate-v0.1.5         && git push --tags   # → @orangecheck/gate
git tag cli-v0.3.0          && git push --tags   # → @orangecheck/cli
git tag react-v0.2.0        && git push --tags   # → @orangecheck/react
git tag wallet-adapter-v0.1.0 && git push --tags # → @orangecheck/wallet-adapter
git tag relay-filter-v0.1.1 && git push --tags   # → @orangecheck/relay-filter
git tag airdrop-gate-v0.1.1 && git push --tags   # → @orangecheck/airdrop-gate
git tag sdk-py-v0.1.0       && git push --tags   # → orangecheck (PyPI)
git tag lock-crypto-v0.1.0  && git push --tags   # → @orangecheck/lock-crypto
git tag lock-core-v0.1.0    && git push --tags   # → @orangecheck/lock-core
git tag lock-device-v0.1.0  && git push --tags   # → @orangecheck/lock-device
git tag vote-core-v0.1.0    && git push --tags   # → @orangecheck/vote-core
git tag vote-cli-v0.1.0     && git push --tags   # → @orangecheck/vote-cli
git tag stamp-core-v0.1.0   && git push --tags   # → @orangecheck/stamp-core
git tag stamp-ots-v0.1.0    && git push --tags   # → @orangecheck/stamp-ots
git tag agent-core-v0.1.0   && git push --tags   # → @orangecheck/agent-core
git tag agent-signer-v0.1.0 && git push --tags   # → @orangecheck/agent-signer
git tag agent-mcp-v0.1.0    && git push --tags   # → @orangecheck/agent-mcp
git tag agent-cli-v0.1.0    && git push --tags   # → @orangecheck/agent-cli
```

The `release.yml` workflow picks up the tag, parses the package name and
version, verifies `package.json` (or `pyproject.toml`) matches, builds, and
publishes with provenance.

Required secrets:
- `NPM_TOKEN` — for JS packages
- PyPI uses OIDC trusted publishing — no token needed

---

## Protocol

The canonical protocol specification lives in `oc-web/docs/oc-protocol/SPEC.md`
(CC-BY-4.0). These packages implement that spec — bug reports about divergence
between the spec and any package implementation belong in the `oc-web`
issue tracker.

---

## License

All code in this repository is MIT-licensed. See [LICENSE](LICENSE).
