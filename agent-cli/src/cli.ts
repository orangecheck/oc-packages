// oc-agent — command-line tool for OC Agent v1 envelopes.
//
// Verify, inspect, canonicalize, and check scope containment against the
// same @orangecheck/agent-core the reference web client uses. Exits 0 on
// success, 1 on any verification/parse error; verify, inspect, scope and
// subscope support --json for script-friendly output.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import {
    actionCanonicalMessage,
    canonicalizeScope,
    computeActionId,
    computeDelegationId,
    computeRevocationId,
    delegationCanonicalMessage,
    isSubScope,
    parseScope,
    REGISTERED_SCOPES,
    revocationCanonicalMessage,
    shownReason,
    validateScope,
    verifyAction,
    verifyActionAsOfSignedAt,
    verifyDelegation,
    verifyRevocation,
    type ActionEnvelope,
    type DelegationEnvelope,
    type RevocationEnvelope,
} from '@orangecheck/agent-core';
import { verifySignature } from '@orangecheck/bip322';
import { Command } from 'commander';

type AnyEnvelope = DelegationEnvelope | ActionEnvelope | RevocationEnvelope;

const program = new Command();

program
    .name('oc-agent')
    .description('command-line verifier for OC Agent envelopes')
    .version((createRequire(import.meta.url)('../package.json') as { version: string }).version);

// ─────────────────────────────────────────────────────────────────────────────
// verify
// ─────────────────────────────────────────────────────────────────────────────

program
    .command('verify')
    .description(
        'verify an envelope (delegation / action / revocation). accepts a single envelope, or an array [delegation, action|revocation] for full authority verification.'
    )
    .argument('<file>', 'path to the envelope JSON file, or "-" for stdin')
    .option('--json', 'machine-readable JSON output', false)
    .option('--skip-sig', 'skip BIP-322 signature verification', false)
    .option('--skip-temporal', 'skip issued_at / expires_at checks', false)
    .option(
        '--revocations <file>',
        'a JSON array of the revocations fetched for the delegation; without it, revocation is not checked'
    )
    .option(
        '--as-of-signed-at',
        "audit a past action as of its own signed_at instead of now; that time is the agent's claim unless anchored",
        false
    )
    .action(
        async (
            file: string,
            opts: {
                json: boolean;
                skipSig: boolean;
                skipTemporal: boolean;
                revocations?: string;
                asOfSignedAt: boolean;
            }
        ) => {
        const parsed = JSON.parse(await read(file));
        const revocations = opts.revocations
            ? (JSON.parse(await read(opts.revocations)) as RevocationEnvelope[])
            : undefined;
        // This CLI has no relay access by design, so it cannot query the
        // kind-30085 feed itself: the caller passes what they fetched, or the
        // verdict says revocation was not checked.
        const revocationInput = revocations ? { revocations } : { skipRevocationCheck: true };

        const verifyBip322 = opts.skipSig
            ? undefined
            : async (msg: string, sig: string, addr: string) => {
                  return verifySignature(addr, msg, sig);
              };

        if (Array.isArray(parsed) && parsed.length === 2) {
            const [d, a] = parsed as [DelegationEnvelope, ActionEnvelope | RevocationEnvelope];
            if (a.kind === 'agent-action') {
                const input = {
                    action: a,
                    delegation: d,
                    verifyBip322,
                    skipSignatureVerification: opts.skipSig,
                    ...revocationInput,
                };
                // Live by default: the delegation must be in force now and the
                // action recent. An audit of a past action asks for it by name.
                const r = opts.asOfSignedAt
                    ? await verifyActionAsOfSignedAt(input)
                    : await verifyAction(input);
                if (!r.ok && r.code === 'E_STALE') {
                    die(opts.json, r.code, `${r.message}. To audit a past action, add --as-of-signed-at.`);
                }
                report(r, opts.json, 'action + delegation', !opts.skipSig, !!revocations, r.ok ? r.asOf : undefined);
                return;
            }
            if (a.kind === 'agent-revocation') {
                const r = await verifyRevocation({
                    envelope: a,
                    delegation: d,
                    verifyBip322,
                    skipSignatureVerification: opts.skipSig,
                });
                report(r, opts.json, 'revocation + delegation', !opts.skipSig, true);
                return;
            }
            die(opts.json, 'UNKNOWN_PAIR', `unknown second envelope kind: ${(a as AnyEnvelope).kind}`);
        }

        const env = parsed as AnyEnvelope;
        if (env.kind === 'agent-delegation') {
            const r = await verifyDelegation({
                envelope: env,
                verifyBip322,
                skipSignatureVerification: opts.skipSig,
                skipTemporalCheck: opts.skipTemporal,
                ...revocationInput,
            });
            report(r, opts.json, 'delegation', !opts.skipSig, !!revocations);
            return;
        }
        if (env.kind === 'agent-action') {
            die(
                opts.json,
                'NEED_DELEGATION',
                'an action envelope needs the cited delegation. pass an array: [delegation, action].'
            );
        }
        if (env.kind === 'agent-revocation') {
            die(
                opts.json,
                'NEED_DELEGATION',
                'a revocation envelope needs the cited delegation. pass an array: [delegation, revocation].'
            );
        }
        die(opts.json, 'UNKNOWN_KIND', `unknown envelope kind: ${(env as AnyEnvelope).kind}`);
        }
    );

// ─────────────────────────────────────────────────────────────────────────────
// inspect
// ─────────────────────────────────────────────────────────────────────────────

program
    .command('inspect')
    .description('pretty-print an envelope with key fields and a recomputed id.')
    .argument('<file>', 'path to the envelope JSON file, or "-" for stdin')
    .option('--json', 'machine-readable JSON output', false)
    .action(async (file: string, opts: { json: boolean }) => {
        const env = JSON.parse(await read(file)) as AnyEnvelope;
        const recomputed = recomputeId(env);
        if (opts.json) {
            console.log(JSON.stringify({ envelope: env, recomputed_id: recomputed }, null, 2));
            return;
        }
        console.log(`kind:    ${env.kind}`);
        console.log(`v:       ${env.v}`);
        console.log(`id:      ${env.id}`);
        console.log(`id(recomputed): ${recomputed} ${recomputed === env.id ? '✓' : '✗'}`);
        if (env.kind === 'agent-delegation') {
            console.log(`principal: ${env.principal.address}`);
            console.log(`agent:     ${env.agent.address}`);
            console.log(`issued:    ${env.issued_at}`);
            console.log(`expires:   ${env.expires_at}`);
            if (env.bond) {
                console.log(`bond:      ${env.bond.sats.toLocaleString()} sats · attestation=${env.bond.attestation_id}`);
            } else {
                console.log(`bond:      none`);
            }
            // v1.2 private mode seals the grant into `scopes_encrypted` and
            // omits `scopes`, so an absent list is not an empty grant — it is a
            // grant this reader cannot see. Printing "scopes:" with nothing
            // under it would read as "no permissions", the opposite of true.
            if (env.scopes) {
                console.log(`scopes:`);
                for (const s of env.scopes) console.log(`  - ${s}`);
            } else {
                console.log(`scopes:    sealed (v1.2 private mode) — needs a recipient device key`);
            }
        } else if (env.kind === 'agent-action') {
            console.log(`agent:           ${env.signer.address}`);
            console.log(`signed_at:       ${env.signed_at}`);
            console.log(`delegation_id:   ${env.delegation_id}`);
            console.log(`scope_exercised: ${env.scope_exercised}`);
            console.log(`content.hash:    ${env.content.hash}`);
            console.log(`content.length:  ${env.content.length}`);
            console.log(`content.mime:    ${env.content.mime}`);
            console.log(`ots:             ${env.ots?.status ?? 'none'}`);
        } else if (env.kind === 'agent-revocation') {
            console.log(`signer:        ${env.signer.address}`);
            console.log(`delegation_id: ${env.delegation_id}`);
            console.log(`reason:        ${shownReason(env.reason)}`);
            console.log(`signed_at:     ${env.signed_at}`);
            console.log(`ots:           ${env.ots?.status ?? 'none'}`);
        }
    });

// ─────────────────────────────────────────────────────────────────────────────
// canonical
// ─────────────────────────────────────────────────────────────────────────────

program
    .command('canonical')
    .description('print the canonical message that an envelope commits to.')
    .argument('<file>', 'path to the envelope JSON file, or "-" for stdin')
    .action(async (file: string) => {
        const env = JSON.parse(await read(file)) as AnyEnvelope;
        process.stdout.write(canonicalMessageFor(env));
    });

// ─────────────────────────────────────────────────────────────────────────────
// scope
// ─────────────────────────────────────────────────────────────────────────────

program
    .command('scope')
    .description('parse a scope string and print its canonical form + registered-key check.')
    .argument('<scope>', 'the scope string, e.g. "ln:send(max_sats<=1000)"')
    .option('--json', 'machine-readable JSON output', false)
    .option('--permissive', 'accept unregistered products / verbs / keys', false)
    .action((scope: string, opts: { json: boolean; permissive: boolean }) => {
        try {
            const parsed = parseScope(scope);
            validateScope(parsed, { mode: opts.permissive ? 'permissive' : 'strict' });
            const canonical = canonicalizeScope(parsed);
            const registered = !!REGISTERED_SCOPES[`${parsed.product}:${parsed.verb}`];
            if (opts.json) {
                console.log(JSON.stringify({ ok: true, canonical, parsed, registered }, null, 2));
            } else {
                console.log(`ok`);
                console.log(`canonical: ${canonical}`);
                console.log(`product:   ${parsed.product}`);
                console.log(`verb:      ${parsed.verb}`);
                console.log(`registered: ${registered ? 'yes' : 'NO (strict mode would reject)'}`);
                if (parsed.constraints.length > 0) {
                    console.log(`constraints:`);
                    for (const c of parsed.constraints) {
                        console.log(`  - ${c.key} ${c.op} ${c.value ?? '(wildcard)'}`);
                    }
                }
            }
        } catch (e) {
            die(opts.json, 'E_BAD_SCOPE_GRAMMAR', (e as Error).message);
        }
    });

// ─────────────────────────────────────────────────────────────────────────────
// subscope
// ─────────────────────────────────────────────────────────────────────────────

program
    .command('subscope')
    .description('check whether exercised scope is a sub-scope of granted.')
    .argument('<granted>', 'the granted scope string')
    .argument('<exercised>', 'the exercised scope string')
    .option('--json', 'machine-readable JSON output', false)
    .action((granted: string, exercised: string, opts: { json: boolean }) => {
        try {
            const g = parseScope(granted);
            const e = parseScope(exercised);
            const admitted = isSubScope(e, g);
            if (opts.json) {
                console.log(JSON.stringify({ admitted }));
            } else {
                console.log(admitted ? 'admitted' : 'rejected (E_SCOPE_DENIED)');
            }
            if (!admitted) process.exit(1);
        } catch (err) {
            die(opts.json, 'E_BAD_SCOPE_GRAMMAR', (err as Error).message);
        }
    });

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

async function read(path: string): Promise<string> {
    if (path === '-') {
        let acc = '';
        for await (const chunk of process.stdin) acc += chunk;
        return acc;
    }
    return readFile(path, 'utf8');
}

function recomputeId(env: AnyEnvelope): string {
    if (env.kind === 'agent-delegation') {
        if (!env.scopes) {
            throw new Error(
                'cannot recompute a delegation id for a v1.2 private delegation: scopes are ' +
                    'sealed in scopes_encrypted and must be decrypted with a recipient device key first',
            );
        }
        return computeDelegationId({
            principal: env.principal.address,
            agent: env.agent.address,
            scopes: env.scopes,
            bond_sats: env.bond?.sats ?? 0,
            bond_attestation: env.bond?.attestation_id ?? 'none',
            issued_at: env.issued_at,
            expires_at: env.expires_at,
            nonce: env.nonce,
        });
    }
    if (env.kind === 'agent-action') {
        return computeActionId({
            address: env.signer.address,
            content_hash: env.content.hash,
            content_length: env.content.length,
            content_mime: env.content.mime,
            signed_at: env.signed_at,
            delegation_id: env.delegation_id,
            scope_exercised: env.scope_exercised,
        });
    }
    return computeRevocationId({
        address: env.signer.address,
        delegation_id: env.delegation_id,
        reason: env.reason ?? '',
        signed_at: env.signed_at,
    });
}

function canonicalMessageFor(env: AnyEnvelope): string {
    if (env.kind === 'agent-delegation') {
        if (!env.scopes) {
            throw new Error(
                'cannot rebuild the canonical message for a v1.2 private delegation: scopes are ' +
                    'sealed in scopes_encrypted',
            );
        }
        return delegationCanonicalMessage({
            principal: env.principal.address,
            agent: env.agent.address,
            scopes: env.scopes,
            bond_sats: env.bond?.sats ?? 0,
            bond_attestation: env.bond?.attestation_id ?? 'none',
            issued_at: env.issued_at,
            expires_at: env.expires_at,
            nonce: env.nonce,
        });
    }
    if (env.kind === 'agent-action') {
        return actionCanonicalMessage({
            address: env.signer.address,
            content_hash: env.content.hash,
            content_length: env.content.length,
            content_mime: env.content.mime,
            signed_at: env.signed_at,
            delegation_id: env.delegation_id,
            scope_exercised: env.scope_exercised,
        });
    }
    return revocationCanonicalMessage({
        address: env.signer.address,
        delegation_id: env.delegation_id,
        reason: env.reason ?? '',
        signed_at: env.signed_at,
    });
}

type AsOf = { basis: 'now'; now: string } | { basis: 'signed_at'; signedAt: string; anchored: boolean };

function report(
    result: { ok: true; id: string } | { ok: false; code: string; message: string },
    asJson: boolean,
    what: string,
    signatureChecked: boolean,
    revocationChecked: boolean,
    asOf?: AsOf
): void {
    if (result.ok) {
        // Unless the caller passed what they fetched, revocation is NOT part
        // of this verdict: the CLI has no relay. "This envelope is authentic"
        // and "this grant is still in force" are not the same claim.
        const notes: string[] = [];
        if (!revocationChecked) {
            notes.push(
                'revocation not checked (offline) — query kind 30085 with "#t": [delegation id] and pass --revocations'
            );
        }
        if (asOf?.basis === 'signed_at') {
            notes.push(
                asOf.anchored
                    ? `checked as of signed_at ${asOf.signedAt}, fixed by a verified anchor`
                    : `checked as of signed_at ${asOf.signedAt}, which is the agent's own claim (no verified anchor)`
            );
        }
        if (asJson) {
            console.log(
                JSON.stringify({
                    ok: true,
                    verified: what,
                    id: result.id,
                    signature_checked: signatureChecked,
                    revocation_checked: revocationChecked,
                    ...(asOf ? { as_of: asOf } : {}),
                    notes,
                }),
            );
        } else {
            console.log(
                signatureChecked
                    ? `OK · ${what} verified`
                    : `OK · ${what} well-formed — signature NOT checked (--skip-sig)`,
            );
            console.log(`  id: ${result.id}`);
            if (asOf?.basis === 'now') console.log(`  checked at ${asOf.now}`);
            for (const n of notes) console.log(`  ! ${n}`);
        }
        return;
    }
    die(asJson, result.code, result.message);
}

function die(asJson: boolean, code: string, message: string): never {
    if (asJson) {
        console.error(JSON.stringify({ ok: false, code, message }));
    } else {
        console.error(`REJECTED · ${code}`);
        console.error(`  ${message}`);
    }
    process.exit(1);
}

program.parseAsync().catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
});
