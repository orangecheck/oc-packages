# `@orangecheck/cli`

**Shell interface to OrangeCheck.** Check, verify, create, challenge, and discover from your terminal or a script.

```bash
yarn global add @orangecheck/cli

oc check --addr bc1q... --min-sats 100000 --min-days 30
# ✓ pass
#   sats:  125,000
#   days:  47
#   score: 18.2
```

Exit code `0` on pass, `2` on fail, `1` on error. JSON output available on every command with `--json`.

---

## Commands

### `oc check` — the sybil-gate primitive

```bash
oc check --addr bc1q... --min-sats 100000 --min-days 30
oc check --identity github:alice --min-sats 50000
oc check --id a3f5b8c2... --min-sats 100000
```

Returns the most recent attestation, verified against live chain state, compared to your thresholds.

### `oc verify` — verify a raw attestation

```bash
# Inline
oc verify --addr bc1q... --msg "$(cat message.txt)" --sig "..."

# From JSON file
oc verify --file attestation.json

# From stdin
cat attestation.json | oc verify
```

The JSON envelope accepts both `{ addr, msg, sig }` and the full wire shape `{ address, message, signature, scheme }`.

### `oc discover` — list attestations

```bash
oc discover --identity nostr:npub1alice...
oc discover --addr bc1q... --limit 10
oc discover --id a3f5b8c2... --json
```

### `oc challenge` — signed-challenge auth

Issue a challenge message for a user's wallet to sign:

```bash
# Prints the signable message to stdout, metadata to stderr
oc challenge issue --addr bc1q... --audience https://example.com --purpose login

# JSON output for scripting
oc challenge issue --addr bc1q... --json > challenge.json
```

Verify a signed challenge:

```bash
oc challenge verify \
  --msg "$(cat challenge-message.txt)" \
  --sig "$(cat signature.b64)" \
  --expected-nonce a1b2c3d4e5f6789012345678901234ab

# Or pipe a JSON envelope
cat signed.json | oc challenge verify --expected-nonce a1b2c3d4...
```

---

## Scripting examples

### Gate a GitHub Action on Bitcoin stake

```yaml
- name: Require OrangeCheck proof
  run: |
      npx -y @orangecheck/cli check \
        --addr ${{ vars.MAINTAINER_BTC_ADDR }} \
        --min-sats 1000000 \
        --min-days 180 \
        --json
```

The command exits `2` when thresholds aren't met, failing the step.

### Build an airdrop allowlist from a list of addresses

```bash
while read addr; do
  if oc check --addr "$addr" --min-sats 100000 --min-days 30 --json | jq -e '.ok' >/dev/null; then
    echo "$addr"
  fi
done < candidates.txt > allowlist.txt
```

### Verify a badge on a Nostr profile page

```bash
# Fetch an attestation envelope from /api/discover, then verify
curl -s "https://ochk.io/api/discover?identity=nostr:npub1alice..." \
  | jq '.attestations[0]' \
  | oc verify --json
```

---

## Output formats

Every command supports `--json` for machine-readable output. Without it you get compact human-readable text on stdout and informational notes on stderr — safe to pipe to `jq` when `--json` is set, or to `grep` / `awk` otherwise.

Exit codes:

- `0` — success (pass / valid / found)
- `1` — error (bad flags, network failure, unexpected)
- `2` — decision is "no" (check failed, verify invalid, challenge rejected)

---

## License

MIT. The OrangeCheck protocol is CC-BY-4.0.
