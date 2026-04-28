// @orangecheck/agent-openai — wrap OpenAI function calls in OC Agent
// action envelopes.
//
// Covers both surfaces:
//   - Responses API:        response.output → tool_call items with
//                            { type: 'function_call', name, arguments, call_id }
//                            (`arguments` is a JSON string)
//   - Chat Completions:     message.tool_calls[i] = { id, function: { name, arguments } }
//                            (`arguments` is also a JSON string)
//
// Both shapes normalize through `parseFunctionCall()` to the canonical
// {id, name, arguments} form before hashing.

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
// Shape normalization
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenAiFunctionCall {
    /** OpenAI's `id` for this call (Chat Completions: `tool_call.id`; Responses: `call_id`). */
    id: string;
    /** The function name. */
    name: string;
    /** The (already-parsed) function arguments. */
    arguments: Record<string, unknown>;
}

/**
 * Normalize either a Chat Completions `tool_call` or a Responses
 * `function_call` item into our canonical {id, name, arguments} shape.
 *
 * Accepts:
 *   - { id, function: { name, arguments } }                      (Chat Completions)
 *   - { call_id, name, arguments }                               (Responses, function_call)
 *   - { id, name, arguments }                                    (already normalized)
 *
 * `arguments` may be either a JSON string (OpenAI's wire shape) or an
 * already-parsed object (your post-processing). Both work.
 */
export function parseFunctionCall(raw: unknown): OpenAiFunctionCall {
    if (raw == null || typeof raw !== 'object') {
        throw new TypeError('parseFunctionCall: input is not an object');
    }
    const r = raw as Record<string, unknown>;

    // Chat Completions shape
    if (r.function && typeof r.function === 'object') {
        const f = r.function as Record<string, unknown>;
        return {
            id: String(r.id ?? ''),
            name: String(f.name ?? ''),
            arguments: parseArgs(f.arguments),
        };
    }

    // Responses API or already-normalized
    return {
        id: String(r.id ?? r.call_id ?? ''),
        name: String(r.name ?? ''),
        arguments: parseArgs(r.arguments),
    };
}

function parseArgs(args: unknown): Record<string, unknown> {
    if (args == null) return {};
    if (typeof args === 'object') return args as Record<string, unknown>;
    if (typeof args === 'string') {
        try {
            const v = JSON.parse(args);
            if (v && typeof v === 'object') return v as Record<string, unknown>;
            return { _raw: args };
        } catch {
            return { _raw: args };
        }
    }
    return { _raw: String(args) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonicalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce the canonical bytes for an OpenAI function call. The bytes are
 * what the agent-action envelope's `content.hash` is a SHA-256 of.
 *
 * Shape (RFC 8785 canonical JSON, then trailing LF):
 *   {
 *     "arguments": <canonical JSON of arguments>,
 *     "id":        <call id>,
 *     "name":      <function name>
 *   }
 */
export function canonicalizeFunctionCall(c: OpenAiFunctionCall): Uint8Array {
    const canon = {
        arguments: c.arguments,
        id: c.id,
        name: c.name,
    };
    const str = canonicalize(canon as unknown as Parameters<typeof canonicalize>[0]);
    return new TextEncoder().encode(str + '\n');
}

export function functionCallHash(c: OpenAiFunctionCall): string {
    return 'sha256:' + hexEncode(sha256(canonicalizeFunctionCall(c)));
}

export function functionCallActionId(
    agentAddress: string,
    signedAt: string,
    delegationId: string,
    scopeExercised: string,
    c: OpenAiFunctionCall
): string {
    return computeActionId({
        address: agentAddress,
        content_hash: functionCallHash(c),
        content_length: canonicalizeFunctionCall(c).byteLength,
        content_mime: 'application/vnd.oc-agent.openai-function-call+json',
        signed_at: signedAt,
        delegation_id: delegationId,
        scope_exercised: scopeExercised,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stamping + invocation
// ─────────────────────────────────────────────────────────────────────────────

export interface StampFunctionCallInput {
    agent: SignerRef;
    delegation: DelegationEnvelope;
    /** Either a normalized `OpenAiFunctionCall` or a raw OpenAI tool_call / function_call object. */
    call: OpenAiFunctionCall | unknown;
    /** Defaults to `openai:function(name=<name>)` — the tightest admissible sub-scope. */
    scopeExercised?: string;
    signedAt?: Date;
}

export async function stampFunctionCall(
    input: StampFunctionCallInput
): Promise<ActionEnvelope> {
    const fc =
        typeof input.call === 'object' &&
        input.call !== null &&
        'arguments' in (input.call as Record<string, unknown>) &&
        typeof (input.call as Record<string, unknown>).arguments !== 'string'
            ? (input.call as OpenAiFunctionCall)
            : parseFunctionCall(input.call);

    const scopeExercised =
        input.scopeExercised ?? `openai:function(name=${fc.name})`;

    const granted = (input.delegation.scopes ?? []).map(parseScope);
    const exercisedParsed = parseScope(scopeExercised);
    if (!granted.some((g) => isSubScope(exercisedParsed, g))) {
        throw new Error(
            `stampFunctionCall: scope_exercised (${scopeExercised}) is not a sub-scope of any granted scope`
        );
    }

    const bytes = canonicalizeFunctionCall(fc);
    return signAsAgent({
        agent: input.agent,
        delegation: input.delegation as never,
        content: { hash: functionCallHash(fc), length: bytes.byteLength },
        mime: 'application/vnd.oc-agent.openai-function-call+json',
        scopeExercised,
        signedAt: input.signedAt,
    });
}

export interface InvokeWithStampInput<T> extends StampFunctionCallInput {
    /** Your handler. Receives the normalized OpenAiFunctionCall. */
    execute: (call: OpenAiFunctionCall) => Promise<T>;
}

export interface InvokeWithStampResult<T> {
    result: T;
    action: ActionEnvelope;
    call: OpenAiFunctionCall;
}

export async function invokeWithStamp<T>(
    input: InvokeWithStampInput<T>
): Promise<InvokeWithStampResult<T>> {
    const action = await stampFunctionCall(input);
    const fc = parseFunctionCall(input.call);
    const result = await input.execute(fc);
    return { result, action, call: fc };
}
