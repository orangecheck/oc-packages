import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AUDIENCE, IDENTITY_KEY, keyed, plain, withoutIdentityKey } from '../src/account';
import { jwks, mint } from '../src/mint';

/**
 * Plan §2, orangecheck 3.21.0 from PyPI: verify_session returns the same Session for the popup's
 * token, and check_oc_session the same answer. COMPAT_PYTHON names a Python that has
 * py/requirements.txt installed (README).
 */

const python = process.env.COMPAT_PYTHON?.trim();
const script = fileURLToPath(new URL('../py/read_session.py', import.meta.url));

type Read = {
    version: string;
    session?: Record<string, unknown> & { claims: Record<string, unknown> };
    refused?: string;
    check: { status: number; session?: Record<string, unknown> & { claims: Record<string, unknown> } };
};

function readWithPython(token: string): Read {
    if (!python) throw new Error('COMPAT_PYTHON is not set: see compat/README.md');
    const out = execFileSync(python, ['-I', script], {
        input: JSON.stringify({ token, audience: AUDIENCE, jwks }),
        encoding: 'utf8',
    });
    return JSON.parse(out) as Read;
}

/** A Session with the new claim taken out of its claims, which hold every claim as sent. */
const sessionWithout = (s: NonNullable<Read['session']>) => ({
    ...s,
    claims: withoutIdentityKey(s.claims),
});

describe('orangecheck 3.21.0 (PyPI)', async () => {
    const before = readWithPython(await mint(plain.audience_token_claims));
    const after = readWithPython(await mint(keyed.audience_token_claims));

    it('verify_session returns the same Session, plus a claim it never reads', () => {
        expect(before.version).toBe('3.21.0');
        expect(before.refused).toBeUndefined();
        expect(before.session).toMatchObject({ did_oc: plain.audience_token_claims.did_oc, aud: AUDIENCE });
        expect(before.session!.claims.amr).toEqual(['email']);
        expect(after.refused).toBeUndefined();
        expect(sessionWithout(after.session!)).toEqual(before.session);
        expect(after.session!.claims.identity_key).toEqual(IDENTITY_KEY);
    });

    it('check_oc_session answers the same', () => {
        expect(before.check.status).toBe(200);
        expect(after.check.status).toBe(200);
        expect(sessionWithout(after.check.session!)).toEqual(before.check.session);
    });
});
