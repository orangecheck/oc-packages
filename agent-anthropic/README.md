# @orangecheck/agent-anthropic

Wrap [Anthropic Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) (Claude `tool_use` blocks) with [OC Agent](https://github.com/orangecheck/oc-agent-protocol) scope enforcement and emit a signed `agent-action` envelope per tool execution.

## Why

Claude's tool-use API exposes a list of tools and produces structured `tool_use` content blocks. The MCP wire format has no native notion of "who authorized this invocation" beyond the transport layer's authentication. For anything consequential — sending email, moving sats, committing code — the handler running underneath should be able to verify:

1. **Which principal stands behind this agent.** A Bitcoin address, not an opaque API key.
2. **What scope authorizes this specific tool call.** A declarative string like `anthropic:tool(name=invoice.create)`.
3. **That the agent hasn't exceeded its grant.** Automatic via OC Agent's sub-scope algorithm.
4. **That the invocation happened before any revocation.** Optional OC Stamp anchoring.

`@orangecheck/agent-anthropic` canonicalizes the `(id, name, input)` tuple, hashes it, and stamps the hash as an `agent-action`. Your handler — or any downstream auditor — sees a verifiable authority artifact alongside the call itself.

## Status

**v0.0.1 · in design.** API shape is stable; the package is published to give integrators something to build against. Production wiring (per-event streaming-API integration with `@anthropic-ai/sdk` v0.45+) lands when the first design partner names the integration. Until then this module is the canonical, transport-agnostic core; you call it from your existing Anthropic-SDK glue.

## Install

```bash
npm i @orangecheck/agent-anthropic
# peer deps:
npm i @orangecheck/agent-core @orangecheck/agent-signer
```

## Quickstart

```ts
import { invokeWithStamp } from '@orangecheck/agent-anthropic';

// You already have a SignerRef and a DelegationEnvelope from
// @orangecheck/agent-signer. The delegation grants something like
//   anthropic:tool(name=invoice.create)

const { result, action } = await invokeWithStamp({
    agent,
    delegation,
    toolUse: {
        id:    'toolu_01abc...',
        name:  'invoice.create',
        input: { customer: 'acme', amount: 14.20 },
    },
    call: async (t) => myInvoiceCreateImpl(t.input),
});

// `result` goes back to Claude as the tool_result content block.
// `action` is the signed envelope; ship it alongside the result, publish
// to Nostr kind 30084, anchor through the OC Stamp pipeline, etc.
```

## What gets stamped

The stamp's `content.hash` is a SHA-256 of the RFC-8785-canonicalized JSON:

```json
{
  "id":    "<tool_use_id>",
  "input": <canonical-json of toolUse.input>,
  "name":  "<tool name>"
}
```

This shape is minimal by design — a verifier reconstructs it from the three fields without knowing anything Anthropic-SDK-specific.

The action's `scope_exercised` defaults to `anthropic:tool(name=<tool>)`, which is the tightest scope that exactly identifies the call. Callers who want a narrower scope can pass `scopeExercised` explicitly; `stampToolUse` pre-flights sub-scope containment against the delegation.

## API

### `canonicalizeToolUse(toolUse) -> Uint8Array`

RFC 8785 JSON canonicalization of `{id, name, input}`. Byte-identical across implementations.

### `toolUseHash(toolUse) -> "sha256:<64-hex>"`

SHA-256 of the canonical bytes, prefixed for the envelope's `content.hash`.

### `stampToolUse(input) -> Promise<ActionEnvelope>`

Produces a signed `agent-action` without executing the tool. Useful for pre-authorization flows or batch stamping.

### `invokeWithStamp(input) -> Promise<{ result, action }>`

Stamp first, then execute the tool. Returns both.

## License

MIT.

## Related

- [oc-agent-protocol](https://github.com/orangecheck/oc-agent-protocol) — normative wire format.
- [@orangecheck/agent-core](https://www.npmjs.com/package/@orangecheck/agent-core) — verifier library.
- [@orangecheck/agent-mcp](https://www.npmjs.com/package/@orangecheck/agent-mcp) — same pattern, for MCP.
- [@orangecheck/agent-openai](https://www.npmjs.com/package/@orangecheck/agent-openai) — same pattern, for OpenAI Responses + Chat Completions.
- [console.ochk.io/integrations/anthropic](https://console.ochk.io/integrations/anthropic) — the managed-tier story this slots into.
