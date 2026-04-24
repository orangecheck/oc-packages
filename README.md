# oc-packages

**Shared stack for the OrangeCheck ecosystem.**
*Sats as signal. No KYC, no custody.*

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

This repository is the ecosystem monorepo — every published
`@orangecheck/*` package and the Python `orangecheck` package live
here. Core OrangeCheck packages (signing, verification, the gate, the
CLI) sit next to protocol-specific packages for OC Lock, OC Stamp,
and OC Vote. Every sibling project shares the same canonical-message
machinery, BIP-322 plumbing, and Nostr kind-30078 conventions, so one
audit and one release cadence covers the whole stack.

## Ecosystem

| Repo | What it is | License |
|---|---|---|
| [`oc-protocol`](https://github.com/orangecheck/oc-protocol) | Core sybil-resistance spec, NIP, registry, conformance vectors | CC-BY-4.0 |
| [`oc-packages`](https://github.com/orangecheck/oc-packages) (this repo) | Every published `@orangecheck/*` package + the Python SDK | MIT |
| [`oc-lock-protocol`](https://github.com/orangecheck/oc-lock-protocol) | OC Lock — E2E encryption addressed to a Bitcoin address | CC-BY-4.0 |
| [`oc-lock-web`](https://github.com/orangecheck/oc-lock-web) | `lock.ochk.io` reference client | MIT |
| [`oc-stamp-protocol`](https://github.com/orangecheck/oc-stamp-protocol) | OC Stamp — Bitcoin-block-anchored signed statements | CC-BY-4.0 |
| `oc-stamp-web` | `stamp.ochk.io` reference client | MIT |
| [`oc-vote-protocol`](https://github.com/orangecheck/oc-vote-protocol) | OC Vote — stake-weighted sybil-resistant polls | CC-BY-4.0 |
| `oc-web` | `ochk.io` site (private) | proprietary |

Every site consumes this repo as a git submodule at `packages/`. The
split exists so package releases are decoupled from site deploys.

---

## Packages

### Core OrangeCheck — cross-cutting, used by every sibling project

| Path | Package | Purpose |
|---|---|---|
| [`sdk/`](sdk/) | `@orangecheck/sdk` | Core TypeScript SDK — `check()`, `verify()`, `createAttestation()`, `issueChallenge()`, canonical-message builders, Nostr discovery, scoring. |
| [`sdk-py/`](sdk-py/) | `orangecheck` (PyPI) | Python SDK. Canonical-message builders, `attestation_id`, `score_v0`, BIP-322 verification (via the Rust-backed `bip322` extra). Mirrors the TypeScript surface; same conformance vectors. |
| [`gate/`](gate/) | `@orangecheck/gate` | Drop-in sybil-gate middleware for Express, Next.js (Pages + App), Fastify, Hono, and Cloudflare Workers. |
| [`cli/`](cli/) | `@orangecheck/cli` | `oc` shell — `oc check / verify / create / challenge / discover`. Exit codes + `--json` for scripts. |
| [`react/`](react/) | `@orangecheck/react` | `<OcBadge>`, `<OcGate>`, `<OcChallengeButton>`. Client components consuming `@orangecheck/sdk`. |
| [`wallet-adapter/`](wallet-adapter/) | `@orangecheck/wallet-adapter` | One `sign(message)` API across UniSat, Xverse, Leather, Alby, plus a copy-paste fallback for Sparrow / Bitcoin Core / hardware. |
| [`relay-filter/`](relay-filter/) | `@orangecheck/relay-filter` | Sybil-filter policy for Nostr relays. Ships with a Strfry plugin and a framework-agnostic core. |
| [`airdrop-gate/`](airdrop-gate/) | `@orangecheck/airdrop-gate` | Turn a candidate list into a sybil-resistant allowlist. Bulk-checks via `@orangecheck/sdk`. |

### OC Lock — end-to-end encryption addressed to a Bitcoin address

| Path | Package | Purpose |
|---|---|---|
| [`lock-crypto/`](lock-crypto/) | `@orangecheck/lock-crypto` | Narrow crypto surface — X25519 ECDH, HKDF-SHA256, AES-256-GCM, CSPRNG, hex / base64 utilities. |
| [`lock-core/`](lock-core/) | `@orangecheck/lock-core` | Envelope format, RFC-8785 canonicalization, `seal()`, `unseal()`, typed `LockError`. |
| [`lock-device/`](lock-device/) | `@orangecheck/lock-device` | Device-key binding statements (BIP-322-signed), Nostr kind-30078 directory (`d: oc-lock:device:<addr>`), deterministic Nostr-key derivation from device secret. |

### OC Stamp — Bitcoin-block-anchored signed statements

| Path | Package | Purpose |
|---|---|---|
| [`stamp-core/`](stamp-core/) | `@orangecheck/stamp-core` | Canonical message + envelope format, `stamp()` / `verify()`. Optional `ots` anchor field, optional OrangeCheck attestation reference for "stake at signing." |
| [`stamp-ots/`](stamp-ots/) | `@orangecheck/stamp-ots` | OpenTimestamps calendar client, `submitToCalendars()`, `upgradeProof()`, and a pluggable `makeAnchorVerifier()` adapter so `stamp-core.verify()` can walk OTS proofs against a block-header source. |

### OC Vote — stake-weighted sybil-resistant polls

| Path | Package | Purpose |
|---|---|---|
| [`vote-core/`](vote-core/) | `@orangecheck/vote-core` | Reference implementation of oc-vote-protocol v0. Canonicalization, content-addressed ids (`pollId` / `ballotId` / `revealId`), secret-mode `commit()`, three canonical weight modes (`one_per_address`, `sats`, `sats_days`), and a deterministic `tally()` function. Conformance-tested against the protocol's 5 canonical test vectors. |
| [`vote-cli/`](vote-cli/) | `@orangecheck/vote-cli` | Shell interface to OC Vote — tally, verify, and inspect polls from your terminal. |

### Roadmap — siblings in flight, packages not yet shipped

| Protocol | Expected packages | Status |
|---|---|---|
| OC Agent — agent-authorization records bound to a signer's address | `@orangecheck/agent-core` | design |

PRs that add a new sibling protocol's packages should also update this
table and drop an entry into `oc-web`'s `/projects` page.

### Other

| Path | What |
|---|---|
| [`EXAMPLES.md`](EXAMPLES.md) | Copy-paste-ready integration snippets for every shipped package. |

All code in this repo is **MIT-licensed**. Protocol specs referenced
above are **CC-BY-4.0** and live in their respective `oc-*-protocol`
repos — bug reports about spec divergence belong in those trackers.

---

## Local development

Each package is independent. Install + build one at a time:

```bash
cd sdk          && yarn install && yarn build
cd ../gate      && yarn install && yarn build
cd ../sdk-py    && pip install -e '.[dev]'
# …
```

### Build order

Some packages depend on other packages in this repo. If you're building
multiple, respect the order:

- `@orangecheck/sdk` → depended on by `gate`, `cli`, `react`, `wallet-adapter`, `relay-filter`, `airdrop-gate`
- `@orangecheck/lock-crypto` → depended on by `lock-core` and `lock-device`
- `@orangecheck/stamp-core` → depended on by `stamp-ots`
- `@orangecheck/vote-core` + `@orangecheck/lock-core` + `@orangecheck/lock-crypto` → depended on by `vote-cli`

The `packages.yml` CI workflow enforces this ordering on every push.

### Tests

Every TypeScript package uses Vitest:

```bash
cd <pkg> && yarn test
```

The Python SDK uses pytest:

```bash
cd sdk-py && pytest
```

Cross-language conformance vectors (`tv01…tv23` for OrangeCheck,
`v01…v05` for OC Vote) are vendored from each protocol's `oc-*-protocol`
repo into the package's `__tests__/vectors/` (or `tests/vectors/`)
directory — drift between the spec and any implementation is a CI
failure.

---

## Releases

Tag the commit with the canonical form `<pkg>-v<version>`:

```bash
# Core OrangeCheck (npm)
git tag sdk-v0.1.5            && git push --tags  # → @orangecheck/sdk
git tag gate-v0.1.3           && git push --tags  # → @orangecheck/gate
git tag cli-v0.1.3            && git push --tags  # → @orangecheck/cli
git tag react-v0.1.3          && git push --tags  # → @orangecheck/react
git tag wallet-adapter-v0.1.2 && git push --tags  # → @orangecheck/wallet-adapter
git tag relay-filter-v0.1.3   && git push --tags  # → @orangecheck/relay-filter
git tag airdrop-gate-v0.1.3   && git push --tags  # → @orangecheck/airdrop-gate

# OC Lock (npm)
git tag lock-crypto-v0.1.0    && git push --tags  # → @orangecheck/lock-crypto
git tag lock-core-v0.1.0      && git push --tags  # → @orangecheck/lock-core
git tag lock-device-v0.1.0    && git push --tags  # → @orangecheck/lock-device

# OC Stamp (npm)
git tag stamp-core-v0.1.0     && git push --tags  # → @orangecheck/stamp-core
git tag stamp-ots-v0.1.0      && git push --tags  # → @orangecheck/stamp-ots

# OC Vote (npm)
git tag vote-core-v0.1.0      && git push --tags  # → @orangecheck/vote-core
git tag vote-cli-v0.1.0       && git push --tags  # → @orangecheck/vote-cli

# Python (PyPI)
git tag sdk-py-v0.1.3         && git push --tags  # → orangecheck
```

The `release.yml` workflow parses the tag, verifies it matches the
package's `package.json` (or `pyproject.toml`) version, builds, and
publishes with provenance.

### Required secrets

- `NPM_TOKEN` — scoped to the `@orangecheck` org for npm publishes.
- PyPI uses OIDC trusted publishing — no token needed.

---

## Protocol

Each protocol's canonical specification lives in its own `oc-*-protocol`
repo (see the ecosystem table above). These packages implement those
specs — divergence is a bug. Report spec-vs-implementation mismatches
in the relevant **protocol** repo's issue tracker, not this one.

---

## License

All code in this repository is MIT-licensed. See [LICENSE](LICENSE).
