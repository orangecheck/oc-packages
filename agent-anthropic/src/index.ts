// @orangecheck/agent-anthropic — wrap Anthropic Tool Use invocations in
// OC Agent action envelopes.
//
// Anthropic's Messages API surfaces tool calls as `tool_use` content
// blocks: { type: 'tool_use', id, name, input }. This module canonicalizes
// each tool_use, hashes it, and produces an agent-action envelope binding
// the BIP-322-authenticated agent to the (tool_name, input) tuple — at a
// scope of `anthropic:tool(name=<tool>)`.

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
// Canonicalization of an Anthropic tool_use
// ─────────────────────────────────────────────────────────────────────────────

export interface AnthropicToolUse {
    /** The `id` Anthropic assigns to this tool_use block (passed back as tool_use_id on result). */
    id: string;
    /** The tool name registered in your `tools` array on messages.create. */
    name: string;
    /** The model's structured input for this tool — JSON-serializable. */
    input: Record<string, unknown>;
}

/**
 * Produce the canonical bytes for an Anthropic tool_use. The bytes are what
 * the agent-action envelope's `content.hash` is a SHA-256 of.
 *
 * Shape (RFC 8785 canonical JSON, then trailing LF):
 *   {
 *     "id":    <tool_use_id>,
 *     "input": <canonical JSON of input>,
 *     "name":  <tool name>
 *   }
 */
export function canonicalizeToolUse(t: AnthropicToolUse): Uint8Array {
    const canon = {
        id: t.id,
        input: t.input,
        name: t.name,
    };
    const str = canonicalize(canon as unknown as Parameters<typeof canonicalize>[0]);
    return new TextEncoder().encode(str + '\n');
}

export function toolUseHash(t: AnthropicToolUse): string {
    return 'sha256:' + hexEncode(sha256(canonicalizeToolUse(t)));
}

export function toolUseId(
    agentAddress: string,
    signedAt: string,
    delegationId: string,
    scopeExercised: string,
    t: AnthropicToolUse
): string {
    return computeActionId({
        address: agentAddress,
        content_hash: toolUseHash(t),
        content_length: canonicalizeToolUse(t).byteLength,
        content_mime: 'application/vnd.oc-agent.anthropic-tool-use+json',
        signed_at: signedAt,
        delegation_id: delegationId,
        scope_exercised: scopeExercised,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stamped tool_use
// ─────────────────────────────────────────────────────────────────────────────

export interface StampToolUseInput {
    agent: SignerRef;
    delegation: DelegationEnvelope;
    toolUse: AnthropicToolUse;
    /** Defaults to `anthropic:tool(name=<tool>)` — the tightest admissible sub-scope. */
    scopeExercised?: string;
    signedAt?: Date;
}

/**
 * Stamp an Anthropic tool_use without executing it. Useful for pre-
 * authorization flows or batch stamping.
 */
export async function stampToolUse(input: StampToolUseInput): Promise<ActionEnvelope> {
    const scopeExercised =
        input.scopeExercised ?? `anthropic:tool(name=${input.toolUse.name})`;

    const granted = (input.delegation.scopes ?? []).map(parseScope);
    const exercisedParsed = parseScope(scopeExercised);
    if (!granted.some((g) => isSubScope(exercisedParsed, g))) {
        throw new Error(
            `stampToolUse: scope_exercised (${scopeExercised}) is not a sub-scope of any granted scope`
        );
    }

    const bytes = canonicalizeToolUse(input.toolUse);
    return signAsAgent({
        agent: input.agent,
        delegation: input.delegation as never,
        content: { hash: toolUseHash(input.toolUse), length: bytes.byteLength },
        mime: 'application/vnd.oc-agent.anthropic-tool-use+json',
        scopeExercised,
        signedAt: input.signedAt,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// invokeWithStamp — call the tool AND produce the stamp around it
// ─────────────────────────────────────────────────────────────────────────────

export interface InvokeWithStampInput<T> extends StampToolUseInput {
    /** Your handler that actually runs the tool. Returns whatever the tool returns. */
    call: (toolUse: AnthropicToolUse) => Promise<T>;
}

export interface InvokeWithStampResult<T> {
    result: T;
    action: ActionEnvelope;
}

/**
 * Stamp the tool_use first, then execute the handler. The stamped envelope
 * is returned alongside the result so the caller can ship them together —
 * e.g. as a side-channel to an audit log, or as the `_oc_agent` metadata on
 * the tool_result content block back to Claude.
 */
export async function invokeWithStamp<T>(
    input: InvokeWithStampInput<T>
): Promise<InvokeWithStampResult<T>> {
    const action = await stampToolUse(input);
    const result = await input.call(input.toolUse);
    return { result, action };
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
    /** Optional fetch override for runtimes that need it (Node 18 LTS w/o global fetch, etc). */
    fetch?: typeof fetch;
}

export interface PostActionResult {
    id: string;
    project_id: string;
    delegation_id: string;
}

/**
 * POST a stamped action envelope to console.ochk.io's /api/actions
 * registry. The console:
 *   - re-derives the action id from canonical inputs and rejects on
 *     mismatch (tamper defense)
 *   - validates that the agent address matches the parent delegation's
 *     agent (forgery defense)
 *   - persists, fans out to Nostr (kind 30084), submits to OC Stamp,
 *     and triggers any subscribed webhooks (action.registered)
 *
 * Returns the registered action's id + project_id + delegation_id.
 * Throws on non-2xx with the server's reason string.
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
            // body wasn't json; keep the http_<n> reason
        }
        throw new Error(`postActionToConsole failed: ${reason}`);
    }
    const j = (await r.json()) as { ok: true; action: PostActionResult };
    return j.action;
}

export interface InvokeWithStampAndPostInput<T> extends InvokeWithStampInput<T> {
    /** Console credentials. If absent, behaves like invokeWithStamp (no posting). */
    console?: ConsoleClient;
}

export interface InvokeWithStampAndPostResult<T> extends InvokeWithStampResult<T> {
    /** Set when console is configured AND the POST succeeded. null otherwise. */
    posted: PostActionResult | null;
}

/**
 * Convenience: stamp the tool_use, execute the handler, AND post the
 * stamped envelope to console. Three roundtrips → one call. If `console`
 * is omitted, this is identical to invokeWithStamp + posted=null.
 *
 * The post happens AFTER the call so a failing post doesn't prevent the
 * tool from running. If you need pre-authorization (the post must
 * succeed before the call runs), use stampToolUse + postActionToConsole
 * + your call() in that order.
 */
export async function invokeWithStampAndPost<T>(
    input: InvokeWithStampAndPostInput<T>
): Promise<InvokeWithStampAndPostResult<T>> {
    const { result, action } = await invokeWithStamp(input);
    let posted: PostActionResult | null = null;
    if (input.console) {
        try {
            posted = await postActionToConsole(action, input.console);
        } catch (err) {
            // Best-effort post — surfacing the error here would force
            // every caller to handle "tool ran fine but post failed",
            // which is rarely what they want. Log and continue.
            // eslint-disable-next-line no-console
            console.error('[oc-agent-anthropic] postActionToConsole failed:', err);
        }
    }
    return { result, action, posted };
}
