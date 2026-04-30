// @orangecheck/agent-mcp — wrap MCP tool invocations in OC Agent envelopes.
//
// An MCP client calls tools on an MCP server: { server, name, arguments }.
// This module stamps each invocation as an `agent-action` whose `content.hash`
// is a SHA-256 of the canonicalized (server, name, arguments) tuple, scoped
// as `mcp:invoke(server=<url>,tool=<name>)`. The server — or any counterparty
// — verifies the action before trusting the call.
//
// The wrapper is transport-agnostic. Wire it into whatever MCP client you use
// by calling `invokeWithStamp()` around the raw call.

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
// Canonicalization of an MCP invocation
// ─────────────────────────────────────────────────────────────────────────────

export interface McpInvocation {
    /** Origin URL of the MCP server. Trimmed and lowercased for canonicalization. */
    server: string;
    /** Tool name (method) being invoked. */
    tool: string;
    /** JSON-serializable arguments. */
    arguments: Record<string, unknown>;
}

/**
 * Produce the canonical bytes for an MCP invocation. The bytes are what the
 * action envelope's `content.hash` is a SHA-256 of.
 *
 * Shape:
 *   {
 *     "arguments": <canonical JSON of args>,
 *     "server":    <server url>,
 *     "tool":      <tool name>
 *   }
 *
 * The shape is intentionally minimal so verifiers can reconstruct it without
 * knowing anything server- or tool-specific.
 */
export function canonicalizeInvocation(inv: McpInvocation): Uint8Array {
    const canon = {
        arguments: inv.arguments,
        server: inv.server.trim(),
        tool: inv.tool,
    };
    const str = canonicalize(canon as unknown as Parameters<typeof canonicalize>[0]);
    return new TextEncoder().encode(str + '\n');
}

export function invocationHash(inv: McpInvocation): string {
    return 'sha256:' + hexEncode(sha256(canonicalizeInvocation(inv)));
}

export function invocationId(
    agentAddress: string,
    signedAt: string,
    delegationId: string,
    scopeExercised: string,
    inv: McpInvocation
): string {
    return computeActionId({
        address: agentAddress,
        content_hash: invocationHash(inv),
        content_length: canonicalizeInvocation(inv).byteLength,
        content_mime: 'application/vnd.oc-agent.mcp-invocation+json',
        signed_at: signedAt,
        delegation_id: delegationId,
        scope_exercised: scopeExercised,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stamped invocation
// ─────────────────────────────────────────────────────────────────────────────

export interface StampInvocationInput {
    agent: SignerRef;
    delegation: DelegationEnvelope;
    invocation: McpInvocation;
    /** Defaults to `mcp:invoke(server=<server>,tool=<tool>)` — the tightest admissible sub-scope. */
    scopeExercised?: string;
    signedAt?: Date;
}

/**
 * Stamp an MCP invocation without actually calling it. Useful when the caller
 * wants the signed envelope for out-of-band auditing before (or independent of)
 * running the tool.
 */
export async function stampInvocation(input: StampInvocationInput): Promise<ActionEnvelope> {
    const scopeExercised =
        input.scopeExercised ??
        `mcp:invoke(server=${input.invocation.server.trim()},tool=${input.invocation.tool})`;

    // Tiny pre-flight: confirm the exercised scope is a sub-scope of *some*
    // granted scope. This keeps a common integration mistake from producing
    // an envelope that later fails verifier-side.
    const granted = input.delegation.scopes.map(parseScope);
    const exercisedParsed = parseScope(scopeExercised);
    if (!granted.some((g) => isSubScope(exercisedParsed, g))) {
        throw new Error(
            `stampInvocation: scope_exercised (${scopeExercised}) is not a sub-scope of any granted scope`
        );
    }

    const bytes = canonicalizeInvocation(input.invocation);
    return signAsAgent({
        agent: input.agent,
        delegation: input.delegation,
        content: { hash: invocationHash(input.invocation), length: bytes.byteLength },
        mime: 'application/vnd.oc-agent.mcp-invocation+json',
        scopeExercised,
        signedAt: input.signedAt,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// invokeWithStamp — call the tool AND produce the stamp around it
// ─────────────────────────────────────────────────────────────────────────────

export interface InvokeWithStampInput<T> extends StampInvocationInput {
    /** The underlying transport call. Returns whatever the MCP server returns. */
    call: (inv: McpInvocation) => Promise<T>;
}

export interface InvokeWithStampResult<T> {
    result: T;
    action: ActionEnvelope;
}

/**
 * Stamp the invocation *first*, then execute the call. The stamped envelope
 * is returned alongside the result so the caller can ship them together.
 *
 * Rationale for stamping first: if the downstream call hangs or fails, we
 * still have an on-record commitment that this agent attempted this specific
 * invocation. The server-side verifier sees a stamped intent plus the server's
 * own transcript.
 */
export async function invokeWithStamp<T>(input: InvokeWithStampInput<T>): Promise<InvokeWithStampResult<T>> {
    const action = await stampInvocation(input);
    const result = await input.call(input.invocation);
    return { result, action };
}

// ─────────────────────────────────────────────────────────────────────────────
// Console integration — re-export from the shared client
// ─────────────────────────────────────────────────────────────────────────────

export {
    postActionToConsole,
    type ConsoleClient,
    type PostActionResult,
} from '@orangecheck/agent-console-client';

import {
    postActionToConsole as _post,
    type ConsoleClient as _ConsoleClient,
    type PostActionResult as _PostActionResult,
} from '@orangecheck/agent-console-client';

export interface InvokeWithStampAndPostInput<T> extends InvokeWithStampInput<T> {
    /** Console credentials. If absent, behaves like invokeWithStamp + posted: null. */
    console?: _ConsoleClient;
}

export interface InvokeWithStampAndPostResult<T> extends InvokeWithStampResult<T> {
    /** Set when console is configured AND the POST succeeded. */
    posted: _PostActionResult | null;
}

/**
 * invokeWithStamp + post the stamped envelope to console.ochk.io. The
 * post happens AFTER the call so a failing post never prevents the
 * underlying MCP invocation from running. If `console` is omitted,
 * this is identical to invokeWithStamp + posted: null.
 */
export async function invokeWithStampAndPost<T>(
    input: InvokeWithStampAndPostInput<T>
): Promise<InvokeWithStampAndPostResult<T>> {
    const { result, action } = await invokeWithStamp(input);
    let posted: _PostActionResult | null = null;
    if (input.console) {
        try {
            posted = await _post(action, input.console);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[oc-agent-mcp] postActionToConsole failed:', err);
        }
    }
    return { result, action, posted };
}
