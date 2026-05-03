// @orangecheck/agent-langgraph — wrap LangGraph tool-node executions in
// OC Agent action envelopes.
//
// LangGraph's distinguishing feature is graph state: stateful agents
// composed of typed nodes that share a persisted state object. The
// compliance-relevant question becomes "at what graph state did this
// agent take this action?" — and the answer must be cryptographically
// bound to the action receipt.
//
// This adapter therefore canonicalizes (verb, args, callId, graph_state_hash)
// — one extra field over the agent-mcp / agent-anthropic / agent-openai /
// agent-vercel canonicalization. Two verifiers re-deriving the action from
// a persisted graph snapshot compute the same envelope id only when the
// snapshot's state-hash matches; tampered or out-of-order replay fails.

import { sha256 } from '@noble/hashes/sha256';
import {
    canonicalize,
    computeActionId,
    hexEncode,
    isSubScope,
    parseScope,
    type DelegationEnvelope,
} from '@orangecheck/agent-core';
import {
    signAsAgent,
    type ActionEnvelope,
    type SignerRef,
} from '@orangecheck/agent-signer';

// ─────────────────────────────────────────────────────────────────────────────
// Graph state hashing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a stable hash of a LangGraph state object. Use canonical JSON
 * (RFC 8785) so reordered keys / repeated serializations produce the same
 * hash. Returns `sha256:<64-hex>`.
 *
 * Most LangGraph deployments persist the state object via a checkpointer
 * (in-memory, postgres, redis, etc.). The state-hash here is over the
 * checkpointer's serialized state at the moment the tool node fires.
 */
export function graphStateHash(state: Record<string, unknown>): string {
    const str = canonicalize(state as unknown as Parameters<typeof canonicalize>[0]);
    return 'sha256:' + hexEncode(sha256(new TextEncoder().encode(str + '\n')));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool-call canonicalization
// ─────────────────────────────────────────────────────────────────────────────

export interface LangGraphToolCall {
    /** Stable id assigned by your graph runtime for this tool invocation. */
    callId: string;
    /** Tool verb — typically the node name. */
    verb: string;
    /** JSON-serializable arguments to the tool node. */
    args: Record<string, unknown>;
    /** sha256:<64-hex> of the graph state at the moment of execution. */
    graphStateHash: string;
}

/**
 * Produce the canonical bytes for a LangGraph tool call.
 *
 * Shape (RFC 8785 canonical JSON, then trailing LF):
 *   {
 *     "args":              <canonical JSON of args>,
 *     "call_id":           <callId>,
 *     "graph_state_hash":  <state hash>,
 *     "verb":              <verb>
 *   }
 */
export function canonicalizeToolCall(c: LangGraphToolCall): Uint8Array {
    const canon = {
        args: c.args,
        call_id: c.callId,
        graph_state_hash: c.graphStateHash,
        verb: c.verb,
    };
    const str = canonicalize(canon as unknown as Parameters<typeof canonicalize>[0]);
    return new TextEncoder().encode(str + '\n');
}

export function toolCallHash(c: LangGraphToolCall): string {
    return 'sha256:' + hexEncode(sha256(canonicalizeToolCall(c)));
}

export function toolCallActionId(
    agentAddress: string,
    signedAt: string,
    delegationId: string,
    scopeExercised: string,
    c: LangGraphToolCall
): string {
    return computeActionId({
        address: agentAddress,
        content_hash: toolCallHash(c),
        content_length: canonicalizeToolCall(c).byteLength,
        content_mime: 'application/vnd.oc-agent.langgraph-tool-call+json',
        signed_at: signedAt,
        delegation_id: delegationId,
        scope_exercised: scopeExercised,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stamping primitive
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentContext {
    agent: SignerRef;
    delegation: DelegationEnvelope;
}

export interface StampToolCallInput extends AgentContext {
    call: LangGraphToolCall;
    /** Defaults to `langgraph:tool(verb=<verb>)` — the tightest admissible sub-scope. */
    scopeExercised?: string;
    signedAt?: Date;
}

export async function stampToolCall(input: StampToolCallInput): Promise<ActionEnvelope> {
    const scopeExercised =
        input.scopeExercised ?? `langgraph:tool(verb=${input.call.verb})`;

    const granted = (input.delegation.scopes ?? []).map(parseScope);
    const exercisedParsed = parseScope(scopeExercised);
    if (!granted.some((g) => isSubScope(exercisedParsed, g))) {
        throw new Error(
            `stampToolCall: scope_exercised (${scopeExercised}) is not a sub-scope of any granted scope`
        );
    }

    const bytes = canonicalizeToolCall(input.call);
    return signAsAgent({
        agent: input.agent,
        delegation: input.delegation as never,
        content: { hash: toolCallHash(input.call), length: bytes.byteLength },
        mime: 'application/vnd.oc-agent.langgraph-tool-call+json',
        scopeExercised,
        signedAt: input.signedAt,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ocToolNode — convenience wrapper
// ─────────────────────────────────────────────────────────────────────────────

export interface OcToolNodeInput<TArgs extends Record<string, unknown>, TResult> {
    /** OC Agent verb under which this tool is exercised. */
    verb: string;
    /** Your real handler. Receives the same args your LangGraph tool node receives. */
    execute: (args: TArgs) => Promise<TResult>;
}

export interface OcToolNodeWrapped<TArgs extends Record<string, unknown>, TResult> {
    verb: string;
    /**
     * The execute fn your LangGraph node calls. Receives args + a context
     * object with the agent ref, delegation, callId, current graph state,
     * and an optional `fleet` field that triggers fire-and-forget POST
     * to fleet.ochk.io/api/actions after the underlying execute returns.
     */
    execute: (
        args: TArgs,
        ctx: AgentContext & {
            callId: string;
            graphState: Record<string, unknown>;
            fleet?: FleetClient;
        }
    ) => Promise<{
        result: TResult;
        action: ActionEnvelope;
        posted: PostActionResult | null;
    }>;
}

/**
 * Wrap a LangGraph tool-node execute path so it produces an OC Agent
 * action envelope per call. The wrapper computes the graph_state_hash
 * inline from the supplied state object, so the verifier replaying the
 * graph against a persisted snapshot gets the same hash deterministically.
 *
 * Typical shape:
 *
 *   const createInvoice = ocToolNode({
 *     verb: 'invoice.create',
 *     execute: async (args) => myInvoiceCreateImpl(args),
 *   });
 *
 *   const graph = new StateGraph(MyState)
 *     .addNode('createInvoice', async (state) => {
 *       const args = pickToolArgs(state);
 *       const callId = state.lastToolCallId;
 *       const { result, action } = await createInvoice.execute(args, {
 *         agent, delegation, callId, graphState: state,
 *       });
 *       await audit.append(action);
 *       return mergeResultIntoState(state, result);
 *     });
 */
export function ocToolNode<TArgs extends Record<string, unknown>, TResult>(
    input: OcToolNodeInput<TArgs, TResult>
): OcToolNodeWrapped<TArgs, TResult> {
    return {
        verb: input.verb,
        execute: async (args, ctx) => {
            const call: LangGraphToolCall = {
                callId: ctx.callId,
                verb: input.verb,
                args,
                graphStateHash: graphStateHash(ctx.graphState),
            };
            const action = await stampToolCall({
                agent: ctx.agent,
                delegation: ctx.delegation,
                call,
            });
            const result = await input.execute(args);
            let posted: PostActionResult | null = null;
            if (ctx.fleet) {
                try {
                    posted = await postActionToFleet(action, ctx.fleet);
                } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('[oc-agent-langgraph] postActionToFleet failed:', err);
                }
            }
            return { result, action, posted };
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet integration: POST stamped actions to fleet.ochk.io/api/actions
// ─────────────────────────────────────────────────────────────────────────────

export interface FleetClient {
    /** Defaults to https://fleet.ochk.io. */
    baseUrl?: string;
    /** Bearer token from /settings § 03 (`ock_<hex>`). */
    apiToken: string;
    /** Project the action belongs to (proj_*). */
    projectId: string;
    /** Optional fetch override for runtimes that need it. */
    fetch?: typeof fetch;
}

export interface PostActionResult {
    id: string;
    project_id: string;
    delegation_id: string;
}

export async function postActionToFleet(
    action: ActionEnvelope,
    client: FleetClient
): Promise<PostActionResult> {
    const baseUrl = client.baseUrl ?? 'https://fleet.ochk.io';
    const f = client.fetch ?? fetch;
    const body = {
        project_id: client.projectId,
        delegation_id: action.delegation_id,
        agent_address: action.signer.address,
        scope_exercised: action.scope_exercised,
        content_hash: action.content.hash,
        content_length: action.content.length,
        content_mime: action.content.mime,
        signed_at: action.signed_at,
        signature: action.sig.value,
        id: action.id,
    };
    const r = await f(`${baseUrl}/api/actions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiToken}`,
        },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        let reason = `http_${r.status}`;
        try {
            const j = (await r.json()) as { reason?: string };
            if (j.reason) reason = j.reason;
        } catch {
            // body wasn't json
        }
        throw new Error(`postActionToFleet failed: ${reason}`);
    }
    const j = (await r.json()) as { ok: true; action: PostActionResult };
    return j.action;
}
