// oc-vote gen-reveal-key — print a fresh X25519 keypair for secret-mode
// polls. Use this to pre-generate a key pair you pin into a --reveal-pk
// flag, then publish the matching --reveal-sk at deadline.
//
// The standard `oc-vote create --mode secret` already generates one
// automatically; this command exists for flows that want the key in hand
// before composing the poll (e.g. DAO trustee ceremonies).

import { generateX25519KeyPair, hexEncode } from '@orangecheck/lock-crypto';

export interface GenRevealKeyOptions {
    json?: boolean;
}

export function runGenRevealKey(opts: GenRevealKeyOptions): void {
    const kp = generateX25519KeyPair();
    const reveal_sk = hexEncode(kp.secret);
    const reveal_pk = hexEncode(kp.public);

    if (opts.json) {
        process.stdout.write(JSON.stringify({ reveal_sk, reveal_pk }, null, 2) + '\n');
        return;
    }

    const w = (s: string) => process.stdout.write(s);
    w(`\n  reveal_pk:  ${reveal_pk}\n`);
    w(`  reveal_sk:  ${reveal_sk}\n\n`);
    w(`  pass reveal_pk to --reveal-pk at poll creation.\n`);
    w(`  keep reveal_sk offline until deadline; publish via:\n`);
    w(`    oc-vote reveal --poll <id> --reveal-sk ${reveal_sk} --creator <addr>\n\n`);
}
