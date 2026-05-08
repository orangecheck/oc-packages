# @orangecheck/agent-mcp

> **Full reference:** [docs.ochk.io/sdk/agent-mcp](https://docs.ochk.io/sdk/agent-mcp) — auto-generated from the TypeScript source on every release.
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
import { invokeWithStamp } from '@orangecheck/agent-mcp';

// You already have an agent SignerRef and a DelegationEnvelope from
// @orangecheck/agent-signer. The delegation grants something like
//   mcp:invoke(server=https://mcp.example.com,tool=search)

const { result, action } = await invokeWithStamp({
    agent,
    delegation,
    invocation: {
        server: 'https://mcp.example.com',
        tool: 'search',
        arguments: { query: 'bitcoin identity', limit: 10 },
    },
    call: async (inv) => myMcpClient.invoke(inv.server, inv.tool, inv.arguments),
});

// `result` is whatever the MCP server returned.
// `action` is the signed envelope; ship it alongside the result, publish to
// Nostr kind-30084, anchor to OpenTimestamps, etc.
```

## What gets stamped

The stamp's `content.hash` is a SHA-256 of the RFC-8785-canonicalized JSON:

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

Stamps the invocation first, then calls the tool. The stamp is returned alongside the tool's result — ship them together.

Rationale for stamping-before-calling: if the downstream call hangs or fails, there is still an on-record commitment that this agent attempted this specific invocation. The server-side verifier sees a stamped intent plus the server's own transcript.

## Server-side verification

A server receiving a stamped invocation verifies it with `@orangecheck/agent-core`:

```ts
import { verifyAction } from '@orangecheck/agent-core';

const r = await verifyAction({
    action,
    delegation,
    verifyBip322: async (m, s, a) => bip322.verify(a, m, s),
});
if (!r.ok) throw new Error(`auth failed: ${r.code}`);

// Also re-hash the incoming (server, tool, arguments) to confirm the stamp
// covers exactly this request:
import { invocationHash } from '@orangecheck/agent-mcp';
const expectedHash = invocationHash({
    server: myUrl,
    tool: req.tool,
    arguments: req.arguments,
});
if (expectedHash !== action.content.hash) {
    throw new Error('stamp does not cover this request');
}
```

## Composing with OpenTimestamps

For invocations where priority-against-revocation matters:

```ts
import { stampCommit } from '@orangecheck/stamp-ots';

const { action } = await invokeWithStamp({ /* … */ });
action.ots = await stampCommit(action.id);
```

## Composing with Nostr

Publish the action for public auditability (OC Agent reuses OC Stamp's kind-30084 transport, disambiguated by envelope `kind`):

```ts
await nostr.publish({
    kind: 30084,
    tags: [
        ['d', 'oc-agent-act:' + action.id],
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
