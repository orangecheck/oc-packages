import type { CheckResult } from '@orangecheck/sdk';

/**
 * Where to pull the subject (address / attestation-id / identity) from
 * on an incoming request.
 */
export type SubjectSource =
    | { from: 'header'; name?: string }
    | { from: 'cookie'; name?: string }
    | { from: 'query'; name?: string }
    | { from: 'body'; path?: string }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | { from: (req: any) => string | undefined };

/**
 * Shape that the gate middleware reads from. Works with Express `req`,
 * Next.js `NextApiRequest`, or any object with the relevant fields.
 */
export interface MinimalReq {
    headers?: Record<string, string | string[] | undefined>;
    cookies?: Record<string, string | undefined>;
    query?: Record<string, string | string[] | undefined>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body?: any;
    url?: string;
    method?: string;
}

/**
 * Shape that the gate middleware writes to. Works with Express `res`
 * or Next.js `NextApiResponse`.
 */
export interface MinimalRes {
    status(code: number): MinimalRes;
    json(body: unknown): MinimalRes | void;
    setHeader(name: string, value: string | number | readonly string[]): MinimalRes | void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    end?: (...args: any[]) => void;
}

/**
 * Config for a single gated route.
 *
 * You MUST pick exactly one of `address` / `attestationId` / `identity`
 * — that's the field the gate uses to look the subject up.
 */
export interface GateOptions {
    /** Minimum sats bonded. Default 0 (any proof passes on stake). */
    minSats?: number;
    /** Minimum days unspent. Default 0. */
    minDays?: number;

    /** Pull a Bitcoin address from the request. */
    address?: SubjectSource;
    /** Pull an attestation ID (SHA-256 hex) from the request. */
    attestationId?: SubjectSource;
    /**
     * Pull an identity binding from the request in `protocol:identifier` form,
     * e.g. `github:alice`.
     */
    identity?: SubjectSource;

    /** In-process cache TTL for lookup results. Default 60_000 ms. */
    cacheTtlMs?: number;
    /** Max cache entries. Default 1_000. */
    cacheMax?: number;

    /**
     * If the OrangeCheck lookup throws (relays unreachable, etc.), let the
     * request through. Default `false` — degraded-mode should be explicit.
     */
    failOpen?: boolean;

    /** Override the Nostr relays used for discovery. */
    relays?: string[];

    /**
     * Called with the decision before the response is sent. Use for logging.
     */
    onDecision?: (req: MinimalReq, decision: GateDecision) => void;

    /**
     * Custom "blocked" handler. If omitted, the gate sends a 403 JSON body.
     */
    onBlocked?: (req: MinimalReq, res: MinimalRes, decision: GateDecision) => void;
}

export interface GateDecision {
    /** True iff the request should be allowed through. */
    ok: boolean;
    /** Why the gate blocked (or allowed). */
    reason:
        | 'ok'
        | 'no_subject'
        | 'below_threshold'
        | 'invalid_proof'
        | 'not_found'
        | 'lookup_error'
        | 'fail_open';
    /** Underlying SDK result, present when a lookup happened. */
    check?: CheckResult;
    /** The subject value the gate resolved from the request. */
    subject?: string;
    /** The kind of subject: 'address' | 'attestation_id' | 'identity'. */
    subjectKind?: 'address' | 'attestation_id' | 'identity';
}
