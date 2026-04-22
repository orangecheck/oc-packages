# oc-packages

**OrangeCheck SDK and integration packages.**
*Sats as signal. No KYC, no custody.*

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

This repository hosts the published OrangeCheck packages. Two protocol specs
(`OrangeCheck` and `OC Lock`) and two reference sites (`ochk.io` and
`oc-lock-web`) live in separate repositories:

- [`oc-web`](https://github.com/orangecheck/oc-web) — OrangeCheck site
- [`oc-lock-protocol`](https://github.com/orangecheck/oc-lock-protocol) — OC Lock spec
- [`oc-lock-web`](https://github.com/orangecheck/oc-lock-web) — OC Lock web client

> `oc-web` and `oc-lock-web` consume this repo as a git submodule at
> `packages/`. The split exists so packages can tag, release, and version
> independently of the sites.

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

Two dependency roots:
- `sdk` — build before `gate`, `cli`, `react`, `wallet-adapter`, `relay-filter`, `airdrop-gate`
- `lock-crypto` — build before `lock-core` and `lock-device`

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
