# @orangecheck/agent-console-client

Tiny HTTP client for posting OC Agent envelopes (delegations, actions, revocations, sub-delegations) to [console.ochk.io](https://console.ochk.io).

Used internally by every framework adapter — `@orangecheck/agent-anthropic`, `agent-openai`, `agent-vercel`, `agent-langgraph`, `agent-mcp`. You usually don't need to call this directly; the adapters expose the helpers via their own surface.

```bash
npm install @orangecheck/agent-console-client
```

## Direct use

```ts
import { postActionToConsole } from '@orangecheck/agent-console-client';

await postActionToConsole(stampedAction, {
    apiToken:  process.env.OC_TOKEN!,        // ock_<64-hex>
    projectId: process.env.OC_PROJECT_ID!,    // proj_*
});
```

The console:

- re-derives the action id from canonical inputs (tamper defense)
- validates `action.signer.address === parent_delegation.agent_address`
- persists the row, fans out to Nostr (kind 30084), submits to OC Stamp anchor pipeline, triggers any subscribed webhooks (`action.registered`)

## API

| Function | Posts to | Returns |
|---|---|---|
| `postActionToConsole(action, client)` | `/api/actions` | `{ id, project_id, delegation_id }` |
| `postDelegationToConsole(del, client, extras?)` | `/api/delegations` | `{ id, project_id, status }` |
| `postRevocationToConsole(rev, client)` | `/api/revocations` | `{ id, project_id, delegation_id }` |
| `postSubdelegationToConsole(sub, client, extras?)` | `/api/subdelegations` | `{ id, project_id, parent_id, status }` |

Each throws `ApiError` on non-2xx with the server's stable reason string (`agent_must_match_delegation`, `id_mismatch`, `principal_must_match_session`, `role_forbidden`, etc).

## Configuration

```ts
interface ConsoleClient {
    /** Defaults to https://console.ochk.io. Set for self-hosted / preview deploys. */
    baseUrl?: string;
    /** Bearer token from /settings § 03 (`ock_<hex>`). */
    apiToken: string;
    /** Project the envelope belongs to (proj_*). */
    projectId: string;
    /** Optional fetch override for runtimes that need it (Edge, Workers). */
    fetch?: typeof fetch;
}
```

## License

MIT
