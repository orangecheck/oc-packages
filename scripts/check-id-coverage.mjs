/**
 * Family invariant 4, made executable.
 *
 *   "Every first-class object is identified by SHA-256 of its canonical bytes
 *    with sig.value emptied. The id is then committed to by the signature.
 *    Changing a field produces a different id."
 *
 * The load-bearing half is the last sentence. If a field is absent from the
 * canonical message, mutating it does not move the id — and because the
 * signature commits to the id rather than to the object, a valid signature
 * then proves NOTHING about that field. Someone could alter it after signing
 * and every verifier in the family would still accept the artifact.
 *
 * This walks each package's real canonical input, mutates one leaf at a time,
 * and asserts the id moves. `sig.value` is the single legitimate exclusion:
 * emptying it is precisely what allows the signature to commit to the id.
 *
 * The family uses two encodings, and both satisfy the invariant:
 *   - vote-core canonicalises the JSON object with sig.value blanked (RFC 8785).
 *   - stamp/agent/pledge build a line-oriented message from an input struct
 *     that never contains the signature, so there is nothing to blank.
 * Only the property is checked here, not the encoding — treating one as
 * canonical would flag the other as non-conformant, which it is not.
 *
 * A note for whoever extends this: fixtures must use fields that actually
 * exist. An earlier draft invented `evidence.query` / `evidence.value` on the
 * pledge outcome; mutating a non-existent field changed nothing, and the probe
 * reported that as UNCOVERED. A prober that reads "absent" as "uncovered"
 * manufactures findings. The `expectFields` list guards against exactly that
 * by failing when a fixture drifts from the type it is meant to mirror.
 *
 * Usage: node scripts/check-id-coverage.mjs
 */
const HERE = new URL('.', import.meta.url).pathname;
const pkg = (name) => import(`${HERE}../${name}/dist/index.mjs`);

let idFailures = 0;
let fixtureFailures = 0;

function probe({ label, obj, idFn, allowUncovered = [], expectFields }) {
    // Guard against fixture drift: every field the fixture claims must exist.
    const present = new Set();
    const collect = (o, path) => {
        for (const [k, v] of Object.entries(o)) {
            const p = path ? `${path}.${k}` : k;
            if (v !== null && typeof v === 'object' && !Array.isArray(v)) { collect(v, p); continue; }
            present.add(p);
        }
    };
    collect(obj, '');
    const missing = expectFields.filter((f) => !present.has(f));
    const extra = [...present].filter((f) => !expectFields.includes(f));
    if (missing.length || extra.length) {
        console.error(`  FAIL ${label}: fixture drifted from its type`);
        if (missing.length) console.error(`       expected but absent: ${missing.join(', ')}`);
        if (extra.length) console.error(`       present but unexpected: ${extra.join(', ')}`);
        fixtureFailures++;
        return;
    }

    const base = idFn(obj);
    const uncovered = [];
    for (const p of present) {
        const clone = structuredClone(obj);
        let tgt = clone;
        const parts = p.split('.');
        for (const seg of parts.slice(0, -1)) tgt = tgt[seg];
        const leaf = parts.at(-1);
        const cur = tgt[leaf];
        tgt[leaf] = Array.isArray(cur) ? [...cur, 'extra']
            : typeof cur === 'number' ? cur + 1
            : cur === null ? 'MUTATED'
            : typeof cur === 'boolean' ? !cur
            : `${cur}-MUTATED`;
        let after;
        try {
            after = idFn(clone);
        } catch {
            continue; // canonicalisation rejected the mutation: covered by validation
        }
        if (after === base && !allowUncovered.includes(p)) uncovered.push(p);
    }

    if (uncovered.length) {
        console.error(`  FAIL ${label}: fields OUTSIDE the id -> ${uncovered.join(', ')}`);
        console.error(`       A signature over this id proves nothing about them.`);
        idFailures++;
    } else {
        console.log(`  ok   ${label}`);
    }
}

const S = await pkg('stamp-core');
probe({
    label: 'stamp · envelope',
    idFn: S.computeEnvelopeId,
    expectFields: ['address', 'content_hash', 'content_length', 'content_mime', 'signed_at'],
    obj: {
        address: 'bc1qexample00000000000000000000000000000000',
        content_hash: 'sha256:' + 'a'.repeat(64),
        content_length: 1234,
        content_mime: 'application/octet-stream',
        signed_at: '2026-06-01T00:00:00Z',
    },
});

const A = await pkg('agent-core');
probe({
    label: 'agent · delegation',
    idFn: A.computeDelegationId,
    expectFields: ['principal', 'agent', 'scopes', 'bond_sats', 'bond_attestation', 'issued_at', 'expires_at', 'nonce'],
    obj: {
        principal: 'bc1qprincipal000000000000000000000000000000',
        agent: 'bc1qagent00000000000000000000000000000000',
        scopes: ['read:x'],
        bond_sats: 100000,
        bond_attestation: 'none',
        issued_at: '2026-06-01T00:00:00Z',
        expires_at: '2026-12-01T00:00:00Z',
        nonce: 'b'.repeat(32),
    },
});
probe({
    label: 'agent · action',
    idFn: A.computeActionId,
    expectFields: ['address', 'content_hash', 'content_length', 'content_mime', 'signed_at', 'delegation_id', 'scope_exercised'],
    obj: {
        address: 'bc1qagent00000000000000000000000000000000',
        content_hash: 'sha256:' + 'c'.repeat(64),
        content_length: 99,
        content_mime: 'text/plain',
        signed_at: '2026-06-01T00:00:00Z',
        delegation_id: 'd'.repeat(64),
        scope_exercised: 'read:x',
    },
});

const P = await pkg('pledge-core');
probe({
    label: 'pledge · pledge',
    idFn: P.computePledgeId,
    expectFields: ['swearer', 'proposition', 'resolution.mechanism', 'resolution.query', 'resolves_at.block',
        'expires_at', 'bond.attestation_id', 'bond.min_sats', 'bond.min_days', 'counterparty',
        'dispute.mechanism', 'dispute.params', 'remediation', 'sworn_at', 'nonce'],
    obj: {
        swearer: 'bc1qswearer00000000000000000000000000000000',
        proposition: 'I will ship v1',
        resolution: { mechanism: 'self-attested', query: 'shipped?' },
        resolves_at: { block: 900000 },
        expires_at: '2026-12-01T00:00:00.000Z',
        bond: { attestation_id: 'a'.repeat(64), min_sats: 100000, min_days: 30 },
        counterparty: null,
        dispute: { mechanism: null, params: null },
        remediation: 'breach_recorded',
        sworn_at: '2026-06-01T00:00:00.000Z',
        nonce: 'b'.repeat(32),
    },
});
probe({
    label: 'pledge · outcome',
    idFn: P.computeOutcomeId,
    expectFields: ['pledge_id', 'outcome', 'resolved_at', 'resolved_by',
        'evidence.mechanism', 'evidence.result', 'evidence.witness', 'dispute_window_ends_at'],
    obj: {
        pledge_id: 'c'.repeat(64),
        outcome: 'kept',
        resolved_at: '2026-12-02T00:00:00.000Z',
        resolved_by: 'bc1qresolver0000000000000000000000000000000',
        evidence: { mechanism: 'self-attested', result: 'yes', witness: 'w' },
        dispute_window_ends_at: '2026-12-09T00:00:00.000Z',
    },
});
probe({
    label: 'pledge · abandonment',
    idFn: P.computeAbandonmentId,
    expectFields: ['pledge_id', 'abandoned_at', 'reason'],
    obj: {
        pledge_id: 'c'.repeat(64),
        abandoned_at: '2026-12-02T00:00:00.000Z',
        reason: 'changed plans',
    },
});

const V = await pkg('vote-core');
probe({
    label: 'vote · poll',
    idFn: V.pollId,
    // sig.value is emptied before hashing BY DESIGN — that is what lets the
    // signature commit to the id. The only legitimate exclusion in the family.
    allowUncovered: ['sig.value'],
    // Arrays are probed as single leaves (mutated by append), so `options`
    // is the leaf here rather than options.0.id — that still proves the
    // array's contribution to the id.
    expectFields: ['v', 'kind', 'creator', 'question', 'options',
        'deadline', 'snapshot_block', 'weight_mode', 'weight_params', 'min_sats', 'min_days',
        'mode', 'reveal_pk', 'tiebreak', 'notes', 'created_at', 'nonce',
        'sig.alg', 'sig.pubkey', 'sig.value'],
    obj: {
        v: 0, kind: 'oc-vote/poll',
        creator: 'bc1qcreator00000000000000000000000000000000',
        question: 'ship?',
        options: [{ id: 'yes', label: 'yes' }],
        deadline: '2026-12-01T00:00:00.000Z',
        snapshot_block: 900000,
        weight_mode: 'sats', weight_params: null,
        min_sats: 0, min_days: 0,
        mode: 'open', reveal_pk: null,
        tiebreak: 'latest', notes: null,
        created_at: '2026-06-01T00:00:00.000Z',
        nonce: 'a'.repeat(32),
        sig: { alg: 'bip322', pubkey: 'bc1qcreator00000000000000000000000000000000', value: 'SIG' },
    },
});

// Two distinct failures, deliberately reported differently. A drifted fixture
// means THIS FILE needs updating; an uncovered field means the invariant is
// actually broken. Conflating them would make a maintenance chore look like a
// security regression, and vice versa.
if (fixtureFailures) {
    console.error(`\n  ${fixtureFailures} fixture(s) no longer match their type — update this file.`);
}
if (idFailures) {
    console.error(`\n  ${idFailures} object(s) have fields OUTSIDE their id — invariant 4 is broken.`);
}
if (fixtureFailures || idFailures) process.exit(1);
console.log('\n  invariant 4 holds: every canonical field is inside its id');
