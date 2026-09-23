import { bech32 } from '@scure/base';

const HEX_64_RE = /^[0-9a-f]{64}$/;

function toHex(bytes: Uint8Array): string {
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
}

/** A Nostr public key as lowercase hex, from either `npub1…` or hex. Null if it is neither. */
export function nostrPubkeyToHex(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    if (HEX_64_RE.test(trimmed)) return trimmed;
    if (!trimmed.startsWith('npub1')) return null;
    try {
        const decoded = bech32.decode(trimmed as `${string}1${string}`, 1023);
        if (decoded.prefix !== 'npub') return null;
        const bytes = bech32.fromWords(decoded.words);
        return bytes.length === 32 ? toHex(Uint8Array.from(bytes)) : null;
    } catch {
        return null;
    }
}

/**
 * Every spelling of one Nostr key an attestation may carry in its `i` tag.
 * SPEC §2 prescribes `npub1…`; the reference site also accepts hex.
 */
export function nostrIdentifierForms(identifier: string): string[] {
    const hex = nostrPubkeyToHex(identifier);
    if (!hex) return [identifier];
    const bytes = Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
    return [bech32.encode('npub', bech32.toWords(bytes), 1023), hex];
}
