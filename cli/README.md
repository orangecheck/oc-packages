# `@orangecheck/cli`

**Shell interface to OrangeCheck.** Check, verify, challenge and discover from your terminal or a script, set up an ochk.app project (`oc me`), and verify OC Chat artifacts (`oc chat verify`).

```bash
yarn global add @orangecheck/cli

oc check --addr bc1q... --min-sats 100000 --min-days 30
# ✓ pass
#   sats:  125,000
#   days:  47
#   score: 30.12
```

Exit code `0` on pass, `2` on fail, `3` when nothing could be concluded (the chain or the relays did not answer, or the address holds more coins than the chain API lists), `1` on error. JSON output available on every command with `--json`.

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

### `oc me` — set up an ochk.app project

```bash
oc me archetypes                       # the curated starting configs
oc me subtypes                         # billable event subtypes, with price hints
oc me init --archetype saas-paywall --project-key pk_test_yours \
  --domain yoursite.com --name "Your site"   # writes oc-config.json
oc me validate-config oc-config.json   # or pipe it on stdin
oc me test-fire pk_test_yours session_creation   # needs OC_BEARER_TOKEN or --token
```

`init` writes a price config to review and submit from your project at ochk.app/me/projects. `test-fire` posts one event to me.ochk.io's `/api/integrator/event` with your session as a Bearer token and no `X-OC-Signature`, to smoke-test your webhook handler; me.ochk.io takes an unsigned event only from the project owner's own session, on a test project that does not require signed events.

### `oc chat verify` — check an OC Chat artifact

Verifies a channel version (kind 30110), a channel post (30111) or a directory
listing (30114) by the [OC Chat](https://github.com/orangecheck/oc-chat-protocol)
rules in [`@orangecheck/chat-core`](https://www.npmjs.com/package/@orangecheck/chat-core),
reading the relays, the device records, ochk.io's keys and the chain.

```sh
oc chat verify event.json          # or - for stdin
oc chat verify --channel <channel_id>
oc chat verify --handle alice      # --channel-handle for a channel's handle
oc chat verify event.json --offline
```

`--offline` reads nothing and lists what it did not check (relays, the chain, the
utxo floor, ochk.io's keys); it never prints VERIFIED. Exit codes: 0 verified,
1 failed, 2 a read got no answer or was cut off (nothing concluded), 3 passed the offline
checks only. Reading relays needs Node 22 or later.

An answer that rests on something being absent (a key is live or not bound, a
version has no newer one) needs each read to reach the read floor: the relays
asked, minus the write quorum of 2, plus one. Device records and revocations are
read from nostr-core's five relays, the set OC Lock counts over, so 4 of 5;
channel versions and posts from chat's four, so 3 of 4. A revocation published
to 2 of the five is then always among what answered. Below the floor the result
is NOT READ (exit 2). `--relays` replaces both sets.

Each relay is read page by page to the end of what it holds, whatever page size
it caps at. A relay counts toward the floor only when its read ended complete:
one that stops answering partway is cut off. A version read cut off at its bound
(2,000 events, or a second holding more than a relay sends in a page) stands
only when every REQ of the reads under the role holders' keys met its read floor
and none of those reads was cut off at its bound; else it is NOT READ. With `--relays`, each relay's NIP-11 document is asked for its page size,
and one that declares under 100 is cut off. A relay that caps a page below 100
without declaring it is not told apart.

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
curl -s "https://attest.ochk.io/api/discover?identity=nostr:npub1alice..." \
  | jq '.attestations[0]' \
  | oc verify --json
```

---

## Output formats

Every command supports `--json` for machine-readable output. Without it you get compact human-readable text on stdout and informational notes on stderr — safe to pipe to `jq` when `--json` is set, or to `grep` / `awk` otherwise.

Exit codes (`oc chat verify` has its own, above):

- `0` — success (pass / valid / found)
- `1` — error (bad flags, network failure, unexpected)
- `2` — decision is "no" (check failed, verify invalid, challenge rejected)
- `3` — nothing concluded (`oc check`, `oc verify`): the chain API or the relays did not answer, the address holds more coins than the chain API lists, or the API refused the lookup. Printed as `? unread: …`, with no sats line. Try again, or for a capped address, use one that holds fewer coins.

---

## License

MIT. The OrangeCheck protocol specifications are MIT too.
