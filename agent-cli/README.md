# @orangecheck/agent-cli

Command-line tool for [OC Agent](https://github.com/orangecheck/oc-agent-protocol). Verify, inspect, canonicalize, and reason about delegation / action / revocation envelopes from your shell. Exits 0 on success, 1 on any error. `verify`, `inspect`, `scope` and `subscope` support `--json` for script-friendly output.

## Install

```bash
npm i -g @orangecheck/agent-cli
# or run once, no install:
npx @orangecheck/agent-cli verify delegation.json
```

## Commands

### `oc-agent verify <file>`

Verify an envelope. Takes a file holding a single envelope, or an array `[delegation, action]` or `[delegation, revocation]`. Runs the §SPEC 8 algorithm including BIP-322 signature check.

```bash
oc-agent verify delegation.json
# → OK · delegation verified
#     id: 36d79600…

oc-agent verify pair.json            # [delegation, action]
# → OK · action + delegation verified
#     checked at 2026-10-21T12:00:00.000Z
```

An action is checked live, as of now (SPEC §8): the delegation in force now and `signed_at` within 120 seconds of your clock, or `E_STALE`. To audit a past action as of its own `signed_at`, add `--as-of-signed-at`; the output says that time is the agent's claim unless a verified anchor fixes it.

The CLI has no relay access. Pass the revocations you fetched (`{ kinds: [30085], "#t": [<delegation id>] }`) as a JSON array with `--revocations`; without it, the output says revocation was not checked.

Flags:
- `--revocations <file>` — the revocations fetched for the delegation, as a JSON array
- `--as-of-signed-at` — audit a past action as of its own `signed_at`
- `--skip-sig` — skip BIP-322 signature verification (useful for test vectors with placeholder sigs)
- `--skip-temporal` — skip `issued_at` / `expires_at` checks on a delegation alone (for inspecting historical envelopes)
- `--json` — emit machine-readable JSON

Exits `1` with an error code on rejection:
```
oc-agent verify tampered.json
# → REJECTED · E_BAD_ID
#     reconstructed id (…) does not match envelope.id (…)
```

### `oc-agent inspect <file>`

Pretty-print an envelope with key fields and the recomputed id. Works on any kind (delegation / action / revocation).

```bash
oc-agent inspect delegation.json
# → kind:    agent-delegation
#   id:      36d79…
#   id(recomputed): 36d79… ✓
#   principal: bc1qalice…
#   agent:     bc1qagent…
#   scopes:
#     - ln:send(max_sats<=1000,node=03abc)
```

### `oc-agent canonical <file>`

Print the canonical message the envelope commits to (what a signer actually signed via BIP-322). Useful for debugging id mismatches — just diff two runs.

```bash
oc-agent canonical delegation.json
# → oc-agent:delegation:v1
#   principal: bc1qalice…
#   agent: bc1qagent…
#   scopes: lock:seal(recipient=bc1qbob)
#   bond_sats: 0
#   bond_attestation: none
#   issued_at: 2026-04-22T12:00:00Z
#   expires_at: 2026-04-29T12:00:00Z
#   nonce: 0123…cdef
```

### `oc-agent scope <string>`

Parse a scope string and print its canonical form plus the registered-key check.

```bash
oc-agent scope 'ln:send(node=03abc,max_sats<=1000)'
# → ok
#   canonical: ln:send(max_sats<=1000,node=03abc)
#   product:   ln
#   verb:      send
#   registered: yes
#   constraints:
#     - node = 03abc
#     - max_sats <= 1000
```

Flags:
- `--permissive` — accept unregistered products, verbs, and constraint keys
- `--json` — machine-readable output

### `oc-agent subscope <granted> <exercised>`

Check whether `exercised` is a sub-scope of `granted` per [SPEC §7.4](https://github.com/orangecheck/oc-agent-protocol/blob/main/SPEC.md#74-sub-scope-relation). Exits 0 (admitted) or 1 (rejected).

```bash
oc-agent subscope 'ln:send(max_sats<=1000)' 'ln:send(max_sats=500,node=03abc)'
# → admitted

oc-agent subscope 'stamp:sign(mime=text/markdown)' 'stamp:sign(mime=application/pdf)'
# → rejected (E_SCOPE_DENIED)
# (exit 1)
```

Great for CI: gate a PR merge on an exercised scope matching a granted grant.

## Use with stdin

Every file-taking command accepts `-` to read from stdin:

```bash
curl -s https://agent.example.com/delegations/abc.json | oc-agent verify -
```

## Composing with other tools

```bash
# Pretty-print every delegation under ~/delegations/
find ~/delegations -name '*.json' -exec oc-agent inspect {} \;

# Fail the pipeline on any rejected envelope
for f in *.delegation.json; do
    oc-agent verify "$f" --json || { echo "bad: $f"; exit 1; }
done

# Batch scope check from a CSV
while IFS=, read -r granted exercised; do
    oc-agent subscope "$granted" "$exercised" --json
done < pairs.csv
```

## License

MIT. See [LICENSE](./LICENSE).
