# @orangecheck/agent-mcp

> **Full reference:** [ochk.io/docs/sdk/agent-mcp](https://ochk.io/docs/sdk/agent-mcp) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Wrap [Model Context Protocol](https://modelcontextprotocol.io/) tool invocations in [OC Agent](https://github.com/orangecheck/oc-agent-protocol) envelopes. Every call produces a signed, scope-constrained, verifiable `agent-action` stamp.

## Why

MCP servers expose tools to AI agents. The MCP wire protocol has no native notion of "who authorized this invocation" beyond whatever the transport layer carries. For anything consequential — sending email, moving sats, committing code, publishing content — the server (or any downstream auditor) should be able to verify:

1. **Which principal stands behind this agent.** A Bitcoin address, not an opaque issuer.
2. **What scope authorizes this specific call.** A declarative string like `mcp:invoke(server=…,tool=…)`.
3. **That the agent hasn't exceeded its grant.** Automatic via OC Agent's sub-scope algorithm.
4. **That the invocation happened before any revocation.** Optional OTS anchoring.

`@orangecheck/agent-mcp` canonicalizes the `(server, tool, arguments)` tuple, hashes it, and stamps the hash as an `agent-action`. The server sees a verifiable authority artifact alongside the call itself.

## Install

```bash
npm i @orangecheck/agent-mcp
# peer deps:
npm i @orangecheck/agent-core @orangecheck/agent-signer
```

## Quickstart

```ts
import { ACTION_META_KEY, invokeWithStamp } from '@orangecheck/agent-mcp';

// You already have an agent SignerRef and a DelegationEnvelope from
// @orangecheck/agent-signer. The delegation grants something like
//   mcp:invoke(server=https://mcp.example.com/mcp,tool=search)

const { result, action } = await invokeWithStamp({
    agent,
    delegation,
    invocation: {
        server: 'https://mcp.example.com/mcp',
        tool: 'search',
        arguments: { query: 'bitcoin identity', limit: 10 },
    },
    // The action rides in the request, so the server verifies it first.
    call: async (inv, action) =>
        myMcpClient.request('tools/call', {
            name: inv.tool,
            arguments: inv.arguments,
            _meta: { [ACTION_META_KEY]: action },
        }),
});
```

`ACTION_META_KEY` is `io.ochk/agent-action`. MCP reserves `_meta` for metadata
and allows prefixed keys, so a server that does not check actions ignores it.
`server` is the endpoint URL exactly as the delegation's scope names it: case,
path and a trailing slash all count.

## What gets stamped

The stamp's `content.hash` is a SHA-256 of the RFC-8785-canonicalized JSON, followed by one LF (0x0A):

```json
{
  "arguments": <canonical-json of invocation.arguments>,
  "server":    <invocation.server, trimmed>,
  "tool":      <invocation.tool>
}
```

This shape is minimal by design — a verifier reconstructs it from the three fields without knowing anything MCP-server-specific.

The action's `scope_exercised` defaults to `mcp:invoke(server=<server>,tool=<tool>)`, which is the tightest scope that exactly identifies the call. Callers who want a narrower or different scope can pass `scopeExercised` explicitly; `stampInvocation` pre-flights sub-scope containment against the delegation.

## API

### `canonicalizeInvocation(inv) -> Uint8Array`

RFC 8785 JSON canonicalization of `{server, tool, arguments}`. Byte-identical across implementations.

### `invocationHash(inv) -> "sha256:<64-hex>"`

SHA-256 of the canonical bytes, prefixed for the envelope's `content.hash`.

### `stampInvocation(input) -> Promise<ActionEnvelope>`

Produces a signed `agent-action` without calling the tool. Useful for pre-authorization flows or batch stamping.

### `invokeWithStamp(input) -> Promise<{ result, action }>`

Stamps the invocation first, then calls `call(invocation, action)`, so the request can carry the action. The action is also returned with the result for your own record.

## Server-side verification

A server checks the action before it runs the tool, with `@orangecheck/agent-core` 2.7 or later:

```ts
import { createReplayGuard, isSubScope, parseScope, verifyAction, type Scope } from '@orangecheck/agent-core';
import { ACTION_META_KEY, canonicalizeInvocation } from '@orangecheck/agent-mcp';
import { verifySignature } from '@orangecheck/bip322';

const seen = createReplayGuard(); // one process; across instances, the same record in a shared store

const action = params._meta?.[ACTION_META_KEY];
// `revocations`: the kind-30085 envelopes you fetched with "#t": [delegation.id].
// If no relay answered, you have not checked: refuse the call.
const r = await verifyAction({
    action,
    delegation,
    revocations,
    verifyBip322: async (m, s, a) => verifySignature(a, m, s),
    // Binds the action to this exact request.
    content: canonicalizeInvocation({ server: MY_ENDPOINT, tool: params.name, arguments: params.arguments }),
});
if (!r.ok) throw new Error(`refused: ${r.code}`);

// The exercised scope must name this server and this tool, not just some grant.
// The tool name is the caller's text: pin it as a value, never as scope syntax.
const here: Scope = {
    product: 'mcp',
    verb: 'invoke',
    constraints: [
        { key: 'server', op: '=', value: MY_ENDPOINT, quoted: true },
        { key: 'tool', op: '=', value: params.name, quoted: true },
    ],
};
if (!isSubScope(parseScope(action.scope_exercised), here)) throw new Error('refused: E_SCOPE_DENIED');

// One signed action runs once.
if (!seen.firstUse(action)) throw new Error('refused: already used');
```

`verifyAction` checks as of now: the delegation in force now, any revocation already in effect, and `signed_at` within 120 s of your clock (`E_STALE` otherwise).

## Composing with OpenTimestamps

For invocations where priority-against-revocation matters:

```ts
import { submitToCalendars, toStampOts } from '@orangecheck/stamp-ots';

const { action } = await invokeWithStamp({ /* … */ });
// Pending until a Bitcoin block confirms it.
action.ots = toStampOts(await submitToCalendars(action.id));
```

## Composing with Nostr

Publish the action for public auditability on kind 30084, OC Agent's action kind. The `t` tag carries the delegation id, so anyone can list a delegation's actions with `{ kinds: [30084], '#t': [delegation.id] }` (oc-agent-protocol SPEC §10.3). Tags sit on the Nostr event, outside the signed envelope, so they change no id:

```ts
await nostr.publish({
    kind: 30084,
    tags: [
        ['d', 'oc-agent-act:' + action.id],
        ['t', action.delegation_id],
        ['kind', 'agent-action'],
        ['delegation', action.delegation_id],
        ['agent', action.signer.address],
        ['scope', action.scope_exercised],
        ['hash', action.content.hash],
        ['signed_at', action.signed_at],
    ],
    content: JSON.stringify(action),
});
```

## License

MIT. See [LICENSE](./LICENSE).
