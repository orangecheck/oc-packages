# @orangecheck/agent-langgraph

Wrap [LangGraph](https://langchain-ai.github.io/langgraph/) tool-node executions in [OC Agent](https://github.com/orangecheck/oc-agent-protocol) action envelopes. Binds each action to the **graph-state hash** at execution time — so verifiers replaying the audit against a persisted graph snapshot can confirm the action fired against the expected state, not a divergent fork.

## Why

LangGraph composes long-running stateful agents from typed nodes. The compliance question is harder than for stateless adapters: at *what graph state* did this agent take this action? Without a state-bound action receipt, "the model called this tool" loses its temporal grounding the moment the graph forks, retries, or replays.

This adapter canonicalizes `(verb, args, callId, graph_state_hash)` — one extra field over the stateless adapters in this family — so the action envelope binds the agent's signature to the exact state snapshot at execution time. Two verifiers re-deriving the action from a persisted graph snapshot get the same envelope id only when the snapshot's state-hash matches.

## Status

**v0.0.1 · in design.** API shape is stable; the canonicalization layout (`{args, call_id, graph_state_hash, verb}` lexicographic, RFC 8785 canonical JSON, trailing LF) is locked. Production wiring with specific LangGraph release lines is intentionally not baked in — `ocToolNode()` is provider/version-agnostic so you can call it from any release of `@langchain/langgraph` you're already on.

## Install

```bash
npm i @orangecheck/agent-langgraph
# peer deps:
npm i @orangecheck/agent-core @orangecheck/agent-signer
```

## Quickstart

```ts
import { StateGraph } from '@langchain/langgraph';
import { ocToolNode } from '@orangecheck/agent-langgraph';

const createInvoice = ocToolNode({
    verb:    'invoice.create',
    execute: async (args) => myInvoiceCreateImpl(args),
});

const graph = new StateGraph(MyState).addNode('createInvoice', async (state) => {
    const args   = pickToolArgs(state);
    const callId = state.lastToolCallId;

    const { result, action } = await createInvoice.execute(args, {
        agent, delegation, callId, graphState: state,
    });

    await yourAuditPipeline.append(action);
    return mergeResultIntoState(state, result);
});
```

The pattern: `ocToolNode` defines the OC-Agent-shaped wrapper; your LangGraph node glue passes the live `graphState` so the wrapper hashes it inline.

## What gets stamped

Stamp's `content.hash` is a SHA-256 of:

```json
{
  "args":             <canonical JSON of args>,
  "call_id":          "<sdk-assigned tool call id>",
  "graph_state_hash": "sha256:<64-hex>",
  "verb":             "<verb>"
}
```

The `graph_state_hash` is itself a `sha256:<64-hex>` over the canonicalized graph state object. Two replays against the same persisted state produce the same hash; a divergent state (extra messages, mutated step counter, anything) produces a different hash and the action envelope will not match.

Default `scope_exercised` is `langgraph:tool(verb=<verb>)`. Override via `scopeExercised`.

## API

- `graphStateHash(state)` — stable `sha256:<64-hex>` of a LangGraph state object.
- `canonicalizeToolCall(call)` — RFC 8785 canonical bytes.
- `toolCallHash(call)` — `sha256:<64-hex>` for `content.hash`.
- `stampToolCall(input)` — sign without executing.
- `ocToolNode({verb, execute})` — wrapped tool node with state-aware canonicalization.

## Replay verification

To verify an action against a persisted graph snapshot:

1. Decode the action envelope's content hash.
2. Recompute `graphStateHash(persisted_state)` and check it equals the `graph_state_hash` declared in the canonicalized content.
3. Run the standard `verifyAction()` from `@orangecheck/agent-core` against the action + delegation + Bitcoin headers.

The replay verifier picks up forks automatically: if the persisted snapshot doesn't match the state at execution time, the `graph_state_hash` differs and the action's content hash won't reproduce.

## License

MIT.

## Related

- [oc-agent-protocol](https://github.com/orangecheck/oc-agent-protocol) — normative wire format.
- [@orangecheck/agent-core](https://www.npmjs.com/package/@orangecheck/agent-core) — verifier library.
- [@orangecheck/agent-mcp](https://www.npmjs.com/package/@orangecheck/agent-mcp) / [-anthropic](https://www.npmjs.com/package/@orangecheck/agent-anthropic) / [-openai](https://www.npmjs.com/package/@orangecheck/agent-openai) / [-vercel](https://www.npmjs.com/package/@orangecheck/agent-vercel) — sibling adapters, all stateless.
- [console.ochk.io/integrations/langgraph](https://console.ochk.io/integrations/langgraph) — managed-tier story.
