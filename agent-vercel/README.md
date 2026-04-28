# @orangecheck/agent-vercel

Wrap [Vercel AI SDK](https://sdk.vercel.ai/) `tool()` invocations with [OC Agent](https://github.com/orangecheck/oc-agent-protocol) scope enforcement and emit a signed `agent-action` envelope per tool execution. Provider-agnostic — works under Anthropic, OpenAI, Cohere, or any other model the AI SDK speaks.

## Why

The Vercel AI SDK has converged on a clean `tool({description, parameters, execute})` primitive that serializes naturally across providers. A single adapter at this layer covers a large fraction of teams shipping production agents.

This module wraps `execute` so every successful call produces a signed `agent-action` envelope citing the active delegation:

- Pre-call: scope check (`vercel:tool(verb=<verb>)` against the delegation; refuses if not admissible).
- Canonicalize the `(verb, args, callId)` tuple, BIP-322 sign as the agent address, emit envelope.
- Run the real handler.
- Return both the result (back to the model via the SDK) and the envelope (for your audit pipeline).

## Status

**v0.0.1 · in design.** API shape is stable; the canonicalization layout (`{args, call_id, verb}` lexicographic, RFC 8785 canonical JSON, trailing LF) is locked. Production wiring with specific AI-SDK releases is intentionally not baked in — `ocTool()` is provider/SDK-agnostic so you can call it from any release of `ai` you're already on.

## Install

```bash
npm i @orangecheck/agent-vercel
# peer deps:
npm i @orangecheck/agent-core @orangecheck/agent-signer
```

## Quickstart

```ts
import { tool } from 'ai';
import { ocTool } from '@orangecheck/agent-vercel';

const invoiceCreate = ocTool({
    verb:        'invoice.create',
    description: 'create a new invoice',
    parameters:  invoiceSchema,
    execute:     async (args) => myInvoiceCreateImpl(args),
});

const tools = {
    'invoice.create': tool({
        description: invoiceCreate.description,
        parameters:  invoiceCreate.parameters as never,
        execute: async (args, { toolCallId }) => {
            const { result, action } = await invoiceCreate.execute(args, {
                agent, delegation, callId: toolCallId,
            });
            await yourAuditPipeline.append(action);
            return result;
        },
    }),
};

const { text } = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    tools,
    prompt: 'invoice acme for $14.20',
});
```

The pattern: `ocTool` defines the OC-Agent-shaped wrapper; the AI SDK's `tool()` calls into that wrapper plus your audit pipeline.

## What gets stamped

Stamp's `content.hash` is a SHA-256 of:

```json
{
  "args":    <canonical JSON of args>,
  "call_id": "<sdk-assigned tool call id>",
  "verb":    "<verb>"
}
```

Default `scope_exercised` is `vercel:tool(verb=<verb>)`. Override via `scopeExercised`.

## API

- `canonicalizeToolCall(call)` — RFC 8785 canonical bytes.
- `toolCallHash(call)` — `sha256:<64-hex>`.
- `stampToolCall(input)` — sign without executing.
- `ocTool({verb, parameters, description, execute})` — provider-agnostic wrapped tool.

## License

MIT.

## Related

- [oc-agent-protocol](https://github.com/orangecheck/oc-agent-protocol) — normative wire format.
- [@orangecheck/agent-core](https://www.npmjs.com/package/@orangecheck/agent-core) — verifier library.
- [@orangecheck/agent-mcp](https://www.npmjs.com/package/@orangecheck/agent-mcp) / [-anthropic](https://www.npmjs.com/package/@orangecheck/agent-anthropic) / [-openai](https://www.npmjs.com/package/@orangecheck/agent-openai) — sibling adapters.
- [console.ochk.io/integrations/vercel-ai](https://console.ochk.io/integrations/vercel-ai) — managed-tier story.
