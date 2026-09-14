# Changelog

All notable changes to **`@orangecheck/lock-device`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.


## [0.2.1] — 2026-09-14

### Fixed — 0.2.0 was uninstallable

`dependencies` carried `"@orangecheck/lock-crypto": "file:../lock-crypto"`, a
workspace-relative path that only resolves inside this monorepo. 0.1.0 had
published a proper `^0.1.0` range; the `file:` reference was sitting in the
working tree and the 0.2.0 publish captured it, so
`yarn add @orangecheck/lock-device@^0.2.0` failed with *Package "" refers to a
non-existing file*.

Every other package here declares real ranges — lock-device was the lone
outlier. The security fix in 0.2.0 therefore reached no consumer; 0.2.1 is that
same fix, installable.

**Check `dependencies` for `file:` before tagging a release.** A publish
captures the manifest as it is on disk, so a local-dev convenience becomes a
broken public artifact.

## [0.2.0] — 2026-09-12

### Security — `parseDeviceEvent` read the device key from an unsigned tag

The BIP-322 binding signature covers `event.content` — the statement — and
nothing else. Tags are an index a relay lets anyone write, so a value read from
a tag has been authenticated by nobody. `parseDeviceEvent` returned `address`,
`device_id` and `device_pk` straight from the tags and never compared them to
the statement it was handing over for verification.

**This was a total confidentiality break, and it needed no key material.**
Republish a victim's device event with their real `content` and real
`binding_sig`, changing only the `device_pk` tag to your own X25519 key.
`verifyBip322(content, sig, addr)` passes — every signed byte is genuine — and
the sender then seals the content key to the attacker, because the recipient
record was built from the tag. Proven against the published package.

Affected every consumer of the sealed-envelope path: oc-lock-web, and
oc-chat-web, whose `binding.ts` guarded the neighbouring splice (a record
carrying the ATTACKER's own `addr`) but not this one, where the attacker keeps
the victim's address and signature and swaps only the key.

`parseDeviceEvent` now parses the signed statement, returns the fields it
commits to, and throws when any tag disagrees. A revocation statement must
carry `device_pk: "revoked"`, so a revocation cannot be smuggled in under a
live-looking key tag either. Content that is not a well-formed v2 bind/revoke
statement is rejected outright rather than parsed from tags.

## [0.1.0] — Initial published state

Initial public release. Device-key management + Nostr kind-30078 directory publication for OC Lock.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-lock-device-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-lock-device-v0.1.0
