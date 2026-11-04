/*
 * A point set as every scene in ./motion takes it: positions in a unit square
 * and a tone (0 paper to 1 full ink) each. On the wire it is compact: per point
 * a Uint16 x and y (little-endian, 0..65535 across the square), then a Uint8
 * tone each, as base64 in a module or as a same-origin binary file. Never a
 * JSON array: the prototype's 4,200 faces were 242 KB of it.
 */

export interface Points {
    count: number;
    x: Float32Array;
    y: Float32Array;
    tone: Float32Array;
    /** A full-tone dot's width as a fraction of the square: the spacing the points were laid on. */
    pitch: number;
    /**
     * For a shaded picture, the grounds that draw each point: bit 1 paper,
     * bit 2 a dark ground. A stipple puts dots where the picture is dark on
     * paper and where it is light on a dark ground, so it stays a positive on
     * both; one set carries both, each dot stored once. Without it every point
     * is ink on either ground, as type and marks should be.
     */
    grounds?: Uint8Array;
}

/** Points from the packed bytes. */
export function unpackPoints(bytes: Uint8Array, pitch: number): Points {
    const count = Math.floor(bytes.length / 5);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const tone = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        x[i] = view.getUint16(i * 4, true) / 65535;
        y[i] = view.getUint16(i * 4 + 2, true) / 65535;
        tone[i] = bytes[count * 4 + i]! / 255;
    }
    return { count, x, y, tone, pitch };
}

function bytes(base64: string): Uint8Array {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** Points from the packed bytes in base64, as a points module carries them. */
export function decodePoints(base64: string, pitch: number): Points {
    return unpackPoints(bytes(base64), pitch);
}

/** Points from a same-origin binary file in the packed form. */
export async function fetchPoints(url: string, pitch: number): Promise<Points> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`points: ${url} answered ${res.status}`);
    return unpackPoints(new Uint8Array(await res.arrayBuffer()), pitch);
}

let bust: Promise<Points> | null = null;
let deck: Promise<Points> | null = null;

/**
 * A bust drawn from shapes (scripts/motion-points.mjs) as a blue-noise
 * stipple, a positive on paper and on a dark ground: ParticlePortrait's
 * default. Imported on first use, so a page carries it only once a portrait
 * asks, and only once.
 */
export function bustPoints(): Promise<Points> {
    bust ??= import('./portrait-points.data').then((m) => ({ ...decodePoints(m.PORTRAIT_POINTS_B64, m.PORTRAIT_PITCH), grounds: bytes(m.PORTRAIT_GROUNDS_B64) }));
    return bust;
}

/**
 * The deck portrait on its 45° screen, as an option for `points`. It is ink
 * on any ground, so it reads best on paper; it has no poster of its own.
 */
export function deckPortraitPoints(): Promise<Points> {
    deck ??= import('./deck-points.data').then((m) => decodePoints(m.DECK_POINTS_B64, m.DECK_PITCH));
    return deck;
}
