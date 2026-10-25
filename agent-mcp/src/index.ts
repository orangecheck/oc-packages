// @orangecheck/agent-mcp — wrap MCP tool invocations in OC Agent envelopes.
//
// An MCP client calls tools on an MCP server: { server, name, arguments }.
// This module stamps each invocation as an `agent-action` whose `content.hash`
// is a SHA-256 of the canonicalized (server, name, arguments) tuple, scoped
// as `mcp:invoke(server=<url>,tool="<name>")`. The server — or any counterparty
// — verifies the action before trusting the call.
//
// The wrapper is transport-agnostic. Wire it into whatever MCP client you use
// by calling `invokeWithStamp()` around the raw call, and send the action with
// the request under `params._meta[ACTION_META_KEY]`.

import { sha256 } from '@noble/hashes/sha256';
import {
    assertScopeGranted,
    canonicalize,
    canonicalizeScope,
    computeActionId,
    hexEncode,
    type DelegationEnvelope,
} from '@orangecheck/agent-core';
import {
    signAsAgent,
    type ActionEnvelope,
    type SignerRef,
} from '@orangecheck/agent-signer';

/**
 * Where an MCP request carries its action: `params._meta[ACTION_META_KEY]` on
 * the `tools/call` request. MCP reserves `_meta` for metadata and allows
 * prefixed keys there, so a server that does not check actions ignores it.
 */
export const ACTION_META_KEY = 'io.ochk/agent-action';

// ─────────────────────────────────────────────────────────────────────────────
// Canonicalization of an MCP invocation
// ─────────────────────────────────────────────────────────────────────────────

export interface McpInvocation {
    /**
     * The MCP server's endpoint URL, exactly as the delegation's
     * `mcp:invoke(server=…)` scope names it. Only surrounding whitespace is
     * trimmed. A scope holds the scheme and host in lower case (OC Agent §7.2
     * rule 4); the path and a trailing slash count as written.
     */
    server: string;
    /** Tool name (method) being invoked. */
    tool: string;
    /** JSON-serializable arguments. */
    arguments: Record<string, unknown>;
}

/**
 * Produce the canonical bytes for an MCP invocation. The bytes are what the
 * action envelope's `content.hash` is a SHA-256 of: RFC 8785 JSON of the
 * object below, followed by one LF (0x0A).
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
    /** Defaults to `mcp:invoke(server=<server>,tool="<tool>")` — the tightest admissible sub-scope. */
    scopeExercised?: string;
    signedAt?: Date;
}

/**
 * Stamp an MCP invocation without actually calling it. Useful when the caller
 * wants the signed envelope for out-of-band auditing before (or independent of)
 * running the tool.
 */
export async function stampInvocation(input: StampInvocationInput): Promise<ActionEnvelope> {
    // The tool name is a quoted value, so it is read as written: "*" is that tool.
    const scopeExercised =
        input.scopeExercised ??
        canonicalizeScope({
            product: 'mcp',
            verb: 'invoke',
            constraints: [
                { key: 'server', op: '=', value: input.invocation.server.trim(), quoted: false },
                { key: 'tool', op: '=', value: input.invocation.tool, quoted: true },
            ],
        });

    assertScopeGranted(input.delegation, scopeExercised, 'stampInvocation');

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
    /**
     * The underlying transport call. It gets the signed action: send it with
     * the request, under `params._meta[ACTION_META_KEY]`, so the server can
     * verify it before it runs the tool.
     */
    call: (inv: McpInvocation, action: ActionEnvelope) => Promise<T>;
}

export interface InvokeWithStampResult<T> {
    result: T;
    action: ActionEnvelope;
}

/**
 * Stamp the invocation *first*, then make the call with the action in hand,
 * so the request carries it and the server verifies before it acts. The
 * action is also returned with the result for the caller's own record.
 *
 * A server checks it live (agent-core `verifyAction`): the delegation in force
 * now, the action signed just now, and an id it has not seen before.
 */
export async function invokeWithStamp<T>(input: InvokeWithStampInput<T>): Promise<InvokeWithStampResult<T>> {
    const action = await stampInvocation(input);
    const result = await input.call(input.invocation, action);
    return { result, action };
}
