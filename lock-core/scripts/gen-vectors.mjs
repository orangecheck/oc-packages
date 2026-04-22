// Generate test vectors for the oc-lock-protocol repo.
//
// Runs seal() with fixed payloads + fixed recipient device secrets, captures
// the envelope bytes and the inputs needed to decrypt them, and writes a
// JSON file per vector. These files are committed to oc-lock-protocol/
// test-vectors/ as the cross-implementation ground truth.
//
// Run: node scripts/gen-vectors.mjs > vectors.txt
// Then copy the files over to oc-lock-protocol/test-vectors/.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateX25519KeyPair, hexEncode, utf8Encode } from '../../lock-crypto/dist/index.mjs';
import { seal } from '../dist/seal.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', '..', '..', 'oc-lock-protocol', 'test-vectors');

const FAKE_SENDER_SIG = 'ZmFrZS1zaWduYXR1cmU=';

async function seedDevice(label) {
    const kp = generateX25519KeyPair();
    return {
        address: `bc1q${label}`,
        device_id: label + '-dev',
        device_pk: hexEncode(kp.public),
        device_sk: hexEncode(kp.secret),
    };
}

async function makeVector(description, payloadText, recipients, opts = {}) {
    const env = await seal({
        payload: utf8Encode(payloadText),
        sender: {
            address: 'bc1qalice',
            signMessage: async () => FAKE_SENDER_SIG,
        },
        recipients: recipients.map(({ address, device_id, device_pk }) => ({
            address, device_id, device_pk,
        })),
        ...opts,
    });
    return {
        description,
        inputs: {
            plaintext: payloadText,
            recipients,
            expected_sig_value: FAKE_SENDER_SIG,
        },
        expected: {
            envelope: env,
        },
    };
}

async function main() {
    await mkdir(OUT, { recursive: true });

    const bob = await seedDevice('bob');
    const carol = await seedDevice('carol');
    const dave = await seedDevice('dave');

    const v01 = await makeVector(
        'single-recipient identity-mode minimal',
        'hello bob',
        [bob]
    );
    const v02 = await makeVector(
        'three recipients — tests device_id canonical sort',
        'broadcast',
        [dave, bob, carol]
    );
    const v03 = await makeVector(
        'envelope with expiry',
        'expires soon',
        [bob],
        { expiresAt: new Date('2099-12-31T23:59:59.999Z') }
    );
    const v04 = await makeVector(
        'envelope with hint',
        'see the hint',
        [bob],
        { hint: 'greeting.txt' }
    );

    const files = { 'v01-minimal.json': v01, 'v02-multi-recipient.json': v02, 'v03-with-expiry.json': v03, 'v04-with-hint.json': v04 };
    for (const [name, data] of Object.entries(files)) {
        const path = resolve(OUT, name);
        await writeFile(path, JSON.stringify(data, null, 2) + '\n');
        console.log('wrote', path);
    }
}

void main();
