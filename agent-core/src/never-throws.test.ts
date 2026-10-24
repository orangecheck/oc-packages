// Every public verifier answers with a result, never a throw, whatever a relay
// hands it: each field of each envelope, each list, each list entry and each
// whole input is set in turn to every value below, and every call must resolve.

import { describe, expect, it } from 'vitest';

import {
    AGENT,
    BOND_ATTESTATION,
    NOW,
    SUBAGENT,
    action,
    delegation,
    federation,
    revocation,
    subdelegation,
} from './envelopes.test-helper.js';
import {
    verifyFederationDelegation,
    verifyFederationRevocation,
} from './federation.js';
import {
    verifyAction,
    verifyActionAsOfSignedAt,
    verifyDelegation,
    verifyRevocation,
    verifySubdelegation,
} from './verify.js';

/** A list nested deeper than any stringifier recurses safely. */
function deep(): unknown {
    let v: unknown = 'x';
    for (let i = 0; i < 100_000; i++) v = [v];
    return v;
}

const ABSENT = Symbol('absent');
const ODD: Array<[string, unknown]> = [
    ['absent', ABSENT],
    ['null', null],
    ['0', 0],
    ['-1', -1],
    ['1.5', 1.5],
    ['true', true],
    ["''", ''],
    ["'x'", 'x'],
    ['[]', []],
    ['[null]', [null]],
    ['{}', {}],
    ['deep', deep()],
];

/** Every path into `v` (objects and lists), the root excluded. */
function paths(v: unknown, at: string[] = []): string[][] {
    if (typeof v !== 'object' || v === null || ArrayBuffer.isView(v) || v instanceof Date) return [];
    return Object.entries(v).flatMap(([k, child]) => [[...at, k], ...paths(child, [...at, k])]);
}

/** `root` with the value at `path` set to `to` (removed when ABSENT); never touches `root`. */
function bend<T>(root: T, path: string[], to: unknown): T {
    if (path.length === 0) return (to === ABSENT ? undefined : to) as T;
    // The input holds functions and dates: copy its top level, and clone only the branch bent.
    const copy = { ...(root as Record<string, unknown>) };
    if (path.length > 1) copy[path[0]!] = structuredClone(copy[path[0]!]);
    let at: Record<string, unknown> = copy;
    for (const k of path.slice(0, -1)) at = at[k] as Record<string, unknown>;
    const last = path[path.length - 1]!;
    if (to === ABSENT) {
        if (Array.isArray(at)) at.splice(Number(last), 1);
        else delete at[last];
    } else at[last] = to;
    return copy as T;
}

/**
 * Calls `run` with `base` bent at every path of each named input, the input
 * itself included, and returns the bends that threw.
 */
async function throwsAt(
    name: string,
    base: Record<string, unknown>,
    run: (input: Record<string, unknown>) => Promise<unknown>
): Promise<{ variants: number; threw: string[] }> {
    const threw: string[] = [];
    let variants = 0;
    const tryOne = async (label: string, input: unknown) => {
        variants++;
        try {
            await run(input as Record<string, unknown>);
        } catch (e) {
            threw.push(`${name} ${label}: ${(e as Error)?.message?.slice(0, 120)}`);
        }
    };
    for (const [oddName, odd] of ODD) await tryOne(`(whole input) = ${oddName}`, bend(base, [], odd));
    for (const key of Object.keys(base)) {
        for (const path of [[key], ...paths(base[key], [key])]) {
            for (const [oddName, odd] of ODD) {
                await tryOne(`${path.join('.')} = ${oddName}`, bend(base, path, odd));
            }
        }
    }
    return { variants, threw };
}

const opts = { skipSignatureVerification: true } as const;
const root = delegation();
/** Scopes sealed to a device: the shape the verifier reads before it decrypts (it cannot here). */
const sealed = (env: object, from: string) => {
    const { scopes: _scopes, ...rest } = env as { scopes?: string[] };
    return {
        ...rest,
        scopes_encrypted: {
            v: 2,
            kind: 'oc-lock',
            from: { address: from },
            to: [{ device_id: 'd1', wrapped_key: 'AAAA' }],
            payload: { iv: 'AAAA', ct: 'AAAA' },
        },
    };
};
const device = { device_id: 'd1', secretKey: new Uint8Array(32).fill(1) };
const bonded = delegation({ sats: 10_000, attestation_id: BOND_ATTESTATION });
const sub = subdelegation(root);
const fed = federation();

const CASES: Array<[string, Record<string, unknown>, (i: Record<string, unknown>) => Promise<unknown>]> = [
    [
        'verifyDelegation',
        { envelope: root, revocations: [revocation(root.id)], now: NOW, ...opts },
        (i) => verifyDelegation(i as never),
    ],
    [
        'verifyDelegation (bond)',
        { envelope: bonded, revocations: [revocation(bonded.id)], now: NOW, ...opts },
        (i) => verifyDelegation(i as never),
    ],
    [
        'verifyAction',
        {
            action: action(root.id, AGENT),
            delegation: root,
            revocations: [revocation(root.id)],
            now: NOW,
            ...opts,
        },
        (i) => verifyAction(i as never),
    ],
    [
        'verifyAction (chain)',
        {
            action: action(sub.id, SUBAGENT),
            delegation: root,
            subdelegationChain: [sub],
            revocations: [revocation(sub.id)],
            now: NOW,
            ...opts,
        },
        (i) => verifyAction(i as never),
    ],
    [
        'verifyActionAsOfSignedAt',
        {
            action: action(sub.id, SUBAGENT),
            delegation: root,
            subdelegationChain: [sub],
            revocations: [revocation(root.id)],
            ...opts,
        },
        (i) => verifyActionAsOfSignedAt(i as never),
    ],
    [
        'verifySubdelegation',
        { envelope: sub, parent: root, now: NOW, ...opts },
        (i) => verifySubdelegation(i as never),
    ],
    [
        'verifyDelegation (sealed scopes)',
        {
            envelope: sealed(root, root.principal.address),
            revocations: [],
            decryptScopesWith: device,
            now: NOW,
            ...opts,
        },
        (i) => verifyDelegation(i as never),
    ],
    [
        'verifySubdelegation (sealed scopes)',
        { envelope: sealed(sub, AGENT), parent: root, decryptScopesWith: device, now: NOW, ...opts },
        (i) => verifySubdelegation(i as never),
    ],
    [
        'verifyRevocation',
        { envelope: revocation(root.id), delegation: root, ...opts },
        (i) => verifyRevocation(i as never),
    ],
    [
        'verifyFederationDelegation',
        { envelope: fed.del, revocations: [fed.rev], now: NOW, ...opts },
        (i) => verifyFederationDelegation(i as never),
    ],
    [
        "verifyFederationDelegation (the agent's revocation)",
        { envelope: fed.del, revocations: [revocation(fed.del.id, AGENT)], now: NOW, ...opts },
        (i) => verifyFederationDelegation(i as never),
    ],
    [
        'verifyFederationRevocation',
        { envelope: fed.rev, delegation: fed.del, ...opts },
        (i) => verifyFederationRevocation(i as never),
    ],
];

describe('every public verifier answers, and never throws, whatever it is handed', () => {
    it('reads each well-formed input to its end', async () => {
        // The baselines are well formed, so each bend is a change from a good input.
        expect((await verifyDelegation({ envelope: root, revocations: [], now: NOW, ...opts })).ok).toBe(true);
        expect(
            (
                await verifyAction({
                    action: action(sub.id, SUBAGENT),
                    delegation: root,
                    subdelegationChain: [sub],
                    revocations: [],
                    now: NOW,
                    ...opts,
                })
            ).ok
        ).toBe(true);
        expect((await verifySubdelegation({ envelope: sub, parent: root, now: NOW, ...opts })).ok).toBe(true);
        expect((await verifyRevocation({ envelope: revocation(root.id), delegation: root, ...opts })).ok).toBe(true);
        expect(
            await verifyFederationDelegation({ envelope: fed.del, revocations: [], now: NOW, ...opts })
        ).toMatchObject({ ok: true });
        expect((await verifyFederationRevocation({ envelope: fed.rev, delegation: fed.del, ...opts })).ok).toBe(
            true
        );
    });

    it.each(CASES)('%s', async (name, base, run) => {
        const { variants, threw } = await throwsAt(name, base, run);
        expect(variants).toBeGreaterThan(100);
        expect(threw).toEqual([]);
    }, 120_000);

    // A real BIP-322 library throws on a signature or address it cannot decode.
    const strict = async (msg: unknown, sig: unknown, address: unknown) => {
        if (typeof msg !== 'string' || typeof sig !== 'string' || typeof address !== 'string') {
            throw new TypeError('not text');
        }
        if (sig !== 'AAAA') throw new Error('cannot decode the signature');
        return true;
    };
    it.each(CASES)('%s, with a verifier that throws on what it cannot decode', async (name, base, run) => {
        const checked = { ...base, skipSignatureVerification: false, verifyBip322: strict };
        const { variants, threw } = await throwsAt(name, checked, run);
        expect(variants).toBeGreaterThan(100);
        expect(threw).toEqual([]);
    }, 120_000);
});
