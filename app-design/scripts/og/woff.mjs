/*
 * Reads a WOFF 1.0 file as the font it holds: its sfnt tables, decompressed,
 * and the code points its cmap maps to a glyph. check-og and subset-mono read
 * the mono font's coverage from the file itself, never from a list.
 */
import { inflateSync } from 'node:zlib';

/** The sfnt tables of a WOFF 1.0 file, tag → bytes, decompressed. */
export function woffTables(woff) {
    const buf = Buffer.from(woff);
    if (buf.toString('latin1', 0, 4) !== 'wOFF') throw new Error('not a WOFF 1.0 file');
    const tables = new Map();
    for (let i = 0; i < buf.readUInt16BE(12); i++) {
        const at = 44 + i * 20;
        const [offset, compLength, origLength] = [4, 8, 12].map((k) => buf.readUInt32BE(at + k));
        const data = buf.subarray(offset, offset + compLength);
        tables.set(buf.toString('latin1', at, at + 4), compLength < origLength ? inflateSync(data) : data);
    }
    return tables;
}

/** Every code point the font's Unicode cmap subtables map to a glyph other than .notdef. */
export function cmapCodePoints(woff) {
    const cmap = woffTables(woff).get('cmap');
    if (!cmap) throw new Error('the font has no cmap');
    const out = new Set();
    for (let i = 0; i < cmap.readUInt16BE(2); i++) {
        const platform = cmap.readUInt16BE(4 + i * 8);
        const encoding = cmap.readUInt16BE(6 + i * 8);
        if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
        const t = cmap.readUInt32BE(8 + i * 8);
        const format = cmap.readUInt16BE(t);
        if (format === 4) {
            const segs = cmap.readUInt16BE(t + 6) / 2;
            const ends = t + 14;
            const starts = ends + segs * 2 + 2;
            const deltas = starts + segs * 2;
            const ranges = deltas + segs * 2;
            for (let s = 0; s < segs; s++) {
                const end = cmap.readUInt16BE(ends + s * 2);
                const start = cmap.readUInt16BE(starts + s * 2);
                const delta = cmap.readInt16BE(deltas + s * 2);
                const range = cmap.readUInt16BE(ranges + s * 2);
                for (let c = start; c <= end && c !== 0xffff; c++) {
                    let gid = range === 0 ? c + delta : cmap.readUInt16BE(ranges + s * 2 + range + (c - start) * 2);
                    if (range !== 0 && gid !== 0) gid += delta;
                    if ((gid & 0xffff) !== 0) out.add(c);
                }
            }
        } else if (format === 12) {
            for (let g = 0; g < cmap.readUInt32BE(t + 12); g++) {
                const at = t + 16 + g * 12;
                const [start, end, glyph] = [0, 4, 8].map((k) => cmap.readUInt32BE(at + k));
                for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) out.add(c);
            }
        }
    }
    return out;
}
