// oc-agent-protocol's signed vectors (v67-v75: a delegation and an action under it
// signed by one disclosed burn key per address type, and v72 with one byte of the
// action's signature flipped) through the built binary, as a person runs it:
// `oc-agent verify` on a delegation, and on [delegation, action] as an audit. A
// BIP-322 simple signature is tried again with the finalized BIP's `smp` prefix.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ActionEnvelope, DelegationEnvelope } from '@orangecheck/agent-core';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bin = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

/** OC_AGENT_VECTORS_DIR (CI checks the spec out), else a sibling clone of oc-agent-protocol. */
function vectorsDir(): string | null {
    const env = process.env.OC_AGENT_VECTORS_DIR;
    if (env && existsSync(env)) return env;
    const sibling = resolve(__dirname, '..', '..', '..', 'oc-agent-protocol', 'test-vectors');
    return existsSync(sibling) ? sibling : null;
}

type Outcome = { outcome: 'ACCEPT' } | { outcome: 'REJECT'; error_code: string };

interface SignedVector {
    name: string;
    kind: 'delegation' | 'action';
    id: string;
    envelope: DelegationEnvelope | ActionEnvelope;
    delegationVector: string | null;
    check: { address_type: string; format: 'bip137' | 'bip322-simple'; expected: Outcome };
}

const DIR = vectorsDir();
const VECTORS: SignedVector[] = DIR
    ? readdirSync(DIR)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .flatMap((name) => {
              const d = JSON.parse(readFileSync(join(DIR, name), 'utf8'));
              if (!d.signature_check) return [];
              return [
                  {
                      name,
                      kind: d.kind,
                      id: d.expected.id,
                      envelope: d.expected.envelope,
                      delegationVector: d.cross_refs?.delegation_vector ?? null,
                      check: d.signature_check,
                  },
              ];
          })
    : [];
const byName = new Map(VECTORS.map((v) => [v.name, v]));

const smp = <T extends DelegationEnvelope | ActionEnvelope>(e: T): T => ({
    ...e,
    sig: { ...e.sig, value: `smp${e.sig.value}` },
});

/** What `oc-agent verify` is given for `v`: the delegation, or [delegation, action]. */
function input(v: SignedVector): DelegationEnvelope | [DelegationEnvelope, ActionEnvelope] {
    if (v.kind === 'delegation') return v.envelope as DelegationEnvelope;
    const cited = byName.get(v.delegationVector ?? '');
    if (cited?.kind !== 'delegation') throw new Error(`${v.name} cites no signed delegation`);
    return [cited.envelope as DelegationEnvelope, v.envelope as ActionEnvelope];
}

/** The input as the vector holds it and, for the simple form, with every signature `smp`-prefixed. */
function forms(v: SignedVector): Array<[string, ReturnType<typeof input>]> {
    const given = input(v);
    if (v.check.format !== 'bip322-simple') return [['as signed', given]];
    return [
        ['as signed', given],
        ['smp-prefixed', Array.isArray(given) ? [smp(given[0]), smp(given[1])] : smp(given)],
    ];
}

function verify(given: unknown, ...flags: string[]) {
    const dir = mkdtempSync(join(tmpdir(), 'oc-agent-cli-signed-'));
    writeFileSync(join(dir, 'in.json'), JSON.stringify(given));
    const r = spawnSync(process.execPath, [bin, 'verify', join(dir, 'in.json'), '--json', ...flags], {
        encoding: 'utf8',
    });
    return { status: r.status, out: r.stdout, err: r.stderr };
}

describe('signed vectors through oc-agent verify', () => {
    it('finds the signed vectors, which CI checks out', () => {
        if (!DIR && !process.env.CI) return;
        for (const kind of ['delegation', 'action']) {
            const accepted = VECTORS.filter((v) => v.kind === kind && v.check.expected.outcome === 'ACCEPT');
            expect(new Set(accepted.map((v) => v.check.address_type))).toEqual(
                new Set(['p2pkh', 'p2sh_p2wpkh', 'p2wpkh', 'p2tr'])
            );
        }
        expect(VECTORS.some((v) => v.check.expected.outcome === 'REJECT')).toBe(true);
    });

    for (const v of VECTORS) {
        const accept = v.check.expected.outcome === 'ACCEPT';
        // The vectors' windows have passed: a delegation is checked with its window
        // set aside, an action as an audit of its own signed_at.
        const [flag, what] =
            v.kind === 'delegation' ? ['--skip-temporal', 'delegation'] : ['--as-of-signed-at', 'action + delegation'];
        for (const [form, given] of forms(v)) {
            it(`${accept ? 'accepts' : 'refuses'} ${v.name} (${v.check.address_type}, ${form})`, () => {
                expect(existsSync(bin), 'run `yarn build` first: this checks dist/cli.js').toBe(true);
                const r = verify(given, flag);
                if (accept) {
                    expect(r.status, r.err).toBe(0);
                    expect(JSON.parse(r.out)).toMatchObject({
                        ok: true,
                        verified: what,
                        id: v.id,
                        signature_checked: true,
                    });
                } else {
                    expect(r.status).toBe(1);
                    expect(JSON.parse(r.err)).toMatchObject({
                        ok: false,
                        code: (v.check.expected as { error_code: string }).error_code,
                    });
                }
            });
        }
    }
});
