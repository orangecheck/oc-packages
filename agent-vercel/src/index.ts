// @orangecheck/agent-vercel — wrap Vercel AI SDK `tool()` invocations in
// OC Agent action envelopes.
//
// Provider-agnostic: the AI SDK is the abstraction layer. Whatever model
// you use underneath (Anthropic, OpenAI, Cohere, …) the tool primitive is
// the same {description, parameters, execute} shape. This adapter wraps
// `execute` so every successful call produces a signed agent-action
// envelope citing the active delegation.
//
// Two integration shapes:
//
//   1. ocTool({verb, parameters, execute})
//      A drop-in replacement for `tool()`. The wrapped execute runs the
//      scope check, signs the canonical (verb, args, callId) tuple,
//      then runs your real handler.
//
//   2. stampToolCall(input)
//      Lower-level stamping helper for cases where you have your own
//      tool-execution loop and want to emit envelopes manually.
//
// The agent + delegation are passed via a per-request context object
// (or threaded through closures) — we don't depend on AsyncLocalStorage
// to keep edge-runtime compatibility maximal.

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
// Canonicalization of a tool call
// ─────────────────────────────────────────────────────────────────────────────

export interface VercelToolCall {
    /** Unique id assigned by the AI SDK for this tool invocation. */
    callId: string;
    /** Tool verb / name — passed in via ocTool() or set per-call by your wrapper. */
    verb: string;
    /** JSON-serializable arguments produced by the model. */
    args: Record<string, unknown>;
}

/**
 * Produce the canonical bytes for a Vercel AI SDK tool call.
 *
 * Shape (RFC 8785 canonical JSON, then trailing LF):
 *   {
 *     "args":    <canonical JSON of args>,
 *     "call_id": <callId>,
 *     "verb":    <verb>
 *   }
 */
export function canonicalizeToolCall(c: VercelToolCall): Uint8Array {
    const canon = {
        args: c.args,
        call_id: c.callId,
        verb: c.verb,
    };
    const str = canonicalize(canon as unknown as Parameters<typeof canonicalize>[0]);
    return new TextEncoder().encode(str + '\n');
}

export function toolCallHash(c: VercelToolCall): string {
    return 'sha256:' + hexEncode(sha256(canonicalizeToolCall(c)));
}

export function toolCallActionId(
    agentAddress: string,
    signedAt: string,
    delegationId: string,
    scopeExercised: string,
    c: VercelToolCall
): string {
    return computeActionId({
        address: agentAddress,
        content_hash: toolCallHash(c),
        content_length: canonicalizeToolCall(c).byteLength,
        content_mime: 'application/vnd.oc-agent.vercel-tool-call+json',
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
    call: VercelToolCall;
    /** Defaults to `vercel:tool(verb=<verb>)` — the tightest admissible sub-scope. */
    scopeExercised?: string;
    signedAt?: Date;
}

export async function stampToolCall(input: StampToolCallInput): Promise<ActionEnvelope> {
    const scopeExercised =
        input.scopeExercised ?? `vercel:tool(verb=${input.call.verb})`;

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
        mime: 'application/vnd.oc-agent.vercel-tool-call+json',
        scopeExercised,
        signedAt: input.signedAt,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ocTool — drop-in tool() replacement
// ─────────────────────────────────────────────────────────────────────────────

export interface OcToolInput<TArgs extends Record<string, unknown>, TResult> {
    /** OC Agent verb under which this tool is exercised. */
    verb: string;
    /** Pass-through to AI SDK's `tool()` — the JSON Schema for inputs. */
    parameters?: unknown;
    /** Pass-through description shown to the model. */
    description?: string;
    /** Your real handler. Returns whatever the tool returns. */
    execute: (args: TArgs) => Promise<TResult>;
}

export interface OcToolWrapped<TArgs extends Record<string, unknown>, TResult> {
    verb: string;
    parameters?: unknown;
    description?: string;
    /**
     * The execute fn the AI SDK calls. Receives args + a callId (the AI
     * SDK passes its own callId through — adapter glue passes it via
     * context). Optional `console` field on the context tells the
     * wrapper to fire-and-forget POST the stamped action to console.
     * ochk.io/api/actions after the underlying execute() returns.
     */
    execute: (
        args: TArgs,
        ctx: AgentContext & { callId: string; console?: ConsoleClient }
    ) => Promise<{
        result: TResult;
        action: ActionEnvelope;
        posted: PostActionResult | null;
    }>;
}

/**
 * Wrap a tool() definition so its execute path is scope-checked and
 * envelope-emitting. The exact glue depends on which AI-SDK release you're
 * on — the typical pattern is:
 *
 *   const tools = {
 *     'invoice.create': tool({
 *       description: '…',
 *       parameters:  schema,
 *       execute:     async (args, { toolCallId }) => {
 *         const { result, action } = await invoiceCreate.execute(args, {
 *           agent, delegation, callId: toolCallId,
 *         });
 *         await yourAuditPipeline.append(action);
 *         return result;
 *       },
 *     }),
 *   };
 *
 *   const invoiceCreate = ocTool({
 *     verb: 'invoice.create',
 *     parameters: schema,
 *     execute: async (args) => myInvoiceCreateImpl(args),
 *   });
 *
 * The `ocTool` value is provider/SDK-agnostic — bring your own glue around
 * it. v1 of the adapter intentionally does not import `ai` so it works on
 * any release.
 */
export function ocTool<TArgs extends Record<string, unknown>, TResult>(
    input: OcToolInput<TArgs, TResult>
): OcToolWrapped<TArgs, TResult> {
    return {
        verb: input.verb,
        parameters: input.parameters,
        description: input.description,
        execute: async (args, ctx) => {
            const call: VercelToolCall = {
                callId: ctx.callId,
                verb: input.verb,
                args,
            };
            const action = await stampToolCall({
                agent: ctx.agent,
                delegation: ctx.delegation,
                call,
            });
            const result = await input.execute(args);
            let posted: PostActionResult | null = null;
            if (ctx.console) {
                try {
                    posted = await postActionToConsole(action, ctx.console);
                } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('[oc-agent-vercel] postActionToConsole failed:', err);
                }
            }
            return { result, action, posted };
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Console integration: POST stamped actions to console.ochk.io/api/actions
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsoleClient {
    /** Defaults to https://console.ochk.io. */
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

/**
 * POST a stamped action envelope to console.ochk.io/api/actions. The
 * console re-derives the action id, validates agent-must-match-
 * delegation, persists, fans out to Nostr (kind 30084), submits to
 * OC Stamp, and triggers any subscribed webhooks. Throws on non-2xx
 * with the server's reason string.
 */
export async function postActionToConsole(
    action: ActionEnvelope,
    client: ConsoleClient
): Promise<PostActionResult> {
    const baseUrl = client.baseUrl ?? 'https://console.ochk.io';
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
        throw new Error(`postActionToConsole failed: ${reason}`);
    }
    const j = (await r.json()) as { ok: true; action: PostActionResult };
    return j.action;
}
