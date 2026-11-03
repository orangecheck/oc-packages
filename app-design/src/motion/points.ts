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

/** Points from the packed bytes in base64, as a points module carries them. */
export function decodePoints(base64: string, pitch: number): Points {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return unpackPoints(bytes, pitch);
}

/** Points from a same-origin binary file in the packed form. */
export async function fetchPoints(url: string, pitch: number): Promise<Points> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`points: ${url} answered ${res.status}`);
    return unpackPoints(new Uint8Array(await res.arrayBuffer()), pitch);
}

let portrait: Promise<Points> | null = null;

/**
 * The deck portrait as dots on its own 45° screen, the default for
 * ParticlePortrait. Imported on first use, so a page carries it only once a
 * portrait asks, and only once.
 */
export function portraitPoints(): Promise<Points> {
    portrait ??= import('./portrait-points.data').then((m) => decodePoints(m.PORTRAIT_POINTS_B64, m.PORTRAIT_PITCH));
    return portrait;
}

/**
 * Named places on the deck portrait, in its square, for callouts: where a
 * label's `+` lands. Read off the settled frame.
 */
export const PORTRAIT_ANCHORS = {
    hair: [0.6, 0.14],
    eye: [0.49, 0.22],
    smile: [0.47, 0.33],
    hand: [0.38, 0.44],
    shoulder: [0.7, 0.55],
    sleeve: [0.86, 0.66],
    wrist: [0.4, 0.86],
} as const satisfies Record<string, readonly [number, number]>;
