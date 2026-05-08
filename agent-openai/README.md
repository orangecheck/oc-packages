# @orangecheck/agent-openai

> **Full reference:** [docs.ochk.io/sdk/agent-openai](https://docs.ochk.io/sdk/agent-openai) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Wrap [OpenAI function calls](https://platform.openai.com/docs/guides/function-calling) with [OC Agent](https://github.com/orangecheck/oc-agent-protocol) scope enforcement and emit a signed `agent-action` envelope per invocation. Covers both the new **Responses API** (`function_call` items) and the legacy **Chat Completions** tool path (`tool_calls`).

## Why

Function calling is the OpenAI-shaped way agents reach out to the world. Without scope enforcement and a cryptographic action receipt, "the model called this function" is the entire audit trail. With this adapter, every call carries: the agent address (BIP-322 signed), the active delegation, the exercised scope, the content hash of the inputs, and the OC Stamp anchor — replayable offline forever.

## Status

**v0.0.1 · in design.** API shape is stable; canonicalization is locked. Production wiring (per-event streaming integration with the OpenAI SDK's `responses.stream()` / `chat.completions.create()`) lands when the first design partner names the integration.

## Install

```bash
npm i @orangecheck/agent-openai
# peer deps:
npm i @orangecheck/agent-core @orangecheck/agent-signer
```

## Quickstart

```ts
import { invokeWithStamp } from '@orangecheck/agent-openai';

// Pull a tool_call out of a Chat Completions response …
const toolCall = response.choices[0].message.tool_calls[0];

const { result, action, call } = await invokeWithStamp({
    agent,
    delegation,
    call: toolCall, // raw OpenAI shape — we normalize
    execute: async (c) => myInvoiceCreateImpl(c.arguments),
});

// `result` becomes the tool result you feed back to the model.
// `call` is the normalized OpenAiFunctionCall (id, name, arguments).
// `action` is the signed envelope; ship to your audit bundle / Nostr.
```

The same `invokeWithStamp` works on Responses-API `function_call` items — `parseFunctionCall` handles the `call_id` / `id` and string-vs-object `arguments` differences automatically.

## What gets stamped

The stamp's `content.hash` is a SHA-256 of the RFC-8785-canonicalized JSON:

```json
{
  "arguments": <canonical JSON of arguments>,
  "id":        "<call id>",
  "name":      "<function name>"
}
```

The action's `scope_exercised` defaults to `openai:function(name=<name>)`. Override via `scopeExercised`.

## API

- `parseFunctionCall(raw)` — normalizes a Chat Completions `tool_call` or Responses `function_call` into `{id, name, arguments}`.
- `canonicalizeFunctionCall(call)` — RFC 8785 canonical bytes.
- `functionCallHash(call)` — `sha256:<64-hex>` for `content.hash`.
- `stampFunctionCall(input)` — sign without executing.
- `invokeWithStamp(input)` — sign + execute + return both.

## License

MIT.

## Related

- [oc-agent-protocol](https://github.com/orangecheck/oc-agent-protocol) — normative wire format.
- [@orangecheck/agent-core](https://www.npmjs.com/package/@orangecheck/agent-core) — verifier library.
- [@orangecheck/agent-mcp](https://www.npmjs.com/package/@orangecheck/agent-mcp) — same pattern, for MCP.
- [@orangecheck/agent-anthropic](https://www.npmjs.com/package/@orangecheck/agent-anthropic) — same pattern, for Claude Tool Use.
- [fleet.ochk.io/integrations/openai](https://fleet.ochk.io/integrations/openai) — managed-tier story.
