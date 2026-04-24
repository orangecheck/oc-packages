// Minimal, dependency-free base64 <-> Uint8Array helpers. OTS proof bytes
// are carried as base64 inside OC Stamp envelopes so they survive any text
// transport (URL fragment, JSON, Nostr event content).

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_DECODE_TABLE = (() => {
    const t = new Int16Array(128).fill(-1);
    for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS.charCodeAt(i)] = i;
    t['='.charCodeAt(0)] = -2;
    return t;
})();

export function base64Encode(bytes: Uint8Array): string {
    let out = '';
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
        const a = bytes[i]!;
        const b = bytes[i + 1]!;
        const c = bytes[i + 2]!;
        out +=
            B64_CHARS[a >> 2]! +
            B64_CHARS[((a & 0x03) << 4) | (b >> 4)]! +
            B64_CHARS[((b & 0x0f) << 2) | (c >> 6)]! +
            B64_CHARS[c & 0x3f]!;
    }
    if (i < bytes.length) {
        const a = bytes[i]!;
        const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
        out += B64_CHARS[a >> 2]!;
        out += B64_CHARS[((a & 0x03) << 4) | (b >> 4)]!;
        out += i + 1 < bytes.length ? B64_CHARS[(b & 0x0f) << 2]! : '=';
        out += '=';
    }
    return out;
}

export function base64Decode(s: string): Uint8Array {
    const str = s.replace(/\s+/g, '');
    const len = str.length;
    if (len === 0) return new Uint8Array(0);
    if (len % 4 !== 0) throw new Error('base64: bad length');
    let padding = 0;
    if (str[len - 1] === '=') padding++;
    if (str[len - 2] === '=') padding++;
    const outLen = (len / 4) * 3 - padding;
    const out = new Uint8Array(outLen);
    let o = 0;
    for (let i = 0; i < len; i += 4) {
        const c0 = B64_DECODE_TABLE[str.charCodeAt(i)]!;
        const c1 = B64_DECODE_TABLE[str.charCodeAt(i + 1)]!;
        const c2 = B64_DECODE_TABLE[str.charCodeAt(i + 2)]!;
        const c3 = B64_DECODE_TABLE[str.charCodeAt(i + 3)]!;
        if (c0 < 0 || c1 < 0 || c2 < -2 || c3 < -2) throw new Error('base64: bad char');
        out[o++] = (c0 << 2) | (c1 >> 4);
        if (c2 >= 0) out[o++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
        if (c3 >= 0) out[o++] = ((c2 & 0x03) << 6) | c3;
    }
    return out;
}

export function hexDecode(s: string): Uint8Array {
    if (s.length % 2 !== 0) throw new Error('hex: odd length');
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
        const hi = parseInt(s[i * 2]!, 16);
        const lo = parseInt(s[i * 2 + 1]!, 16);
        if (Number.isNaN(hi) || Number.isNaN(lo)) throw new Error('hex: bad char');
        out[i] = (hi << 4) | lo;
    }
    return out;
}

export function hexEncode(bytes: Uint8Array): string {
    const HEX = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i]!;
        out += HEX[(b >> 4) & 0x0f]! + HEX[b & 0x0f]!;
    }
    return out;
}
