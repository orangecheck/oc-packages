/*
 * Reads a font file as it ships (WOFF2, WOFF 1.0 or a bare sfnt) for the
 * copyright notice and family name in its name table. check-licenses reads
 * every font the package ships with it. Copied from app-design's
 * scripts/og/woff.mjs, without the cmap reader that only app-design's ./og uses.
 */
import { brotliDecompressSync, inflateSync } from 'node:zlib';

/** The sfnt tables of a WOFF 1.0 file, tag → bytes, decompressed. */
function woffTables(buf) {
    const tables = new Map();
    for (let i = 0; i < buf.readUInt16BE(12); i++) {
        const at = 44 + i * 20;
        const [offset, compLength, origLength] = [4, 8, 12].map((k) => buf.readUInt32BE(at + k));
        const data = buf.subarray(offset, offset + compLength);
        tables.set(buf.toString('latin1', at, at + 4), compLength < origLength ? inflateSync(data) : data);
    }
    return tables;
}

/**
 * The sfnt tables of a WOFF2 file that it stores untransformed (name among them), tag → bytes. WOFF2 keeps every table
 * in one Brotli stream, in directory order, each at its transformed length when it has one (glyf, loca, hmtx).
 */
function woff2Tables(buf) {
    let at = 48;
    const base128 = () => {
        let v = 0;
        for (let i = 0; i < 5; i++) {
            const b = buf[at++];
            v = v * 128 + (b & 0x7f);
            if (!(b & 0x80)) return v;
        }
        throw new Error('bad UIntBase128');
    };
    // A table's tag is an index into the spec's known tags (5 is name, 10 glyf, 11 loca), or 63 and the tag itself.
    const dir = [];
    for (let i = 0; i < buf.readUInt16BE(12); i++) {
        const flags = buf[at++];
        const [index, version] = [flags & 0x3f, flags >> 6];
        const tag = index === 63 ? buf.toString('latin1', at, (at += 4)) : index === 5 ? 'name' : `#${index}`;
        const length = base128();
        const transformed = index === 10 || index === 11 ? version !== 3 : version !== 0;
        dir.push([tag, transformed ? base128() : length, transformed]);
    }
    const data = brotliDecompressSync(buf.subarray(at, at + buf.readUInt32BE(20)));
    const tables = new Map();
    let offset = 0;
    for (const [tag, length, transformed] of dir) {
        if (!transformed) tables.set(tag, data.subarray(offset, offset + length));
        offset += length;
    }
    return tables;
}

/** The tables of a font file as it ships: WOFF2, WOFF 1.0, or a bare TrueType or CFF sfnt. */
function fontTables(bytes) {
    const buf = Buffer.from(bytes);
    const magic = buf.toString('latin1', 0, 4);
    if (magic === 'wOF2') return woff2Tables(buf);
    if (magic === 'wOFF') return woffTables(buf);
    if (magic !== 'OTTO' && buf.readUInt32BE(0) !== 0x10000) throw new Error('not a font file');
    const tables = new Map();
    for (let i = 0; i < buf.readUInt16BE(4); i++) {
        const at = 12 + i * 16;
        tables.set(buf.toString('latin1', at, at + 4), buf.subarray(buf.readUInt32BE(at + 8), buf.readUInt32BE(at + 8) + buf.readUInt32BE(at + 12)));
    }
    return tables;
}

/** A font's copyright notice and family name (name IDs 0 and 1), from its Windows Unicode name records. */
export function fontNames(bytes) {
    const name = fontTables(bytes).get('name');
    if (!name) throw new Error('the font has no name table');
    const found = {};
    const strings = name.readUInt16BE(4);
    for (let i = 0; i < name.readUInt16BE(2); i++) {
        const [platform, , , id, length, offset] = [0, 2, 4, 6, 8, 10].map((k) => name.readUInt16BE(6 + i * 12 + k));
        if (platform !== 3 || found[id] !== undefined) continue;
        // A copy: swap16 works in place, and an uncompressed table shares memory with the caller's bytes.
        const utf16 = Buffer.from(name.subarray(strings + offset, strings + offset + length));
        found[id] = utf16.swap16().toString('utf16le');
    }
    return { copyright: found[0], family: found[1] };
}
