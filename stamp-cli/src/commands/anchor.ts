// `stamp anchor <stamp-path>` — submit (or re-submit) an existing stamp's id
// to OTS calendars. If the proof is already confirmed, no-op. If it's
// pending, try to upgrade via the listed calendars.

import { writeFile } from 'node:fs/promises';

import { submitToCalendars, toStampOts } from '@orangecheck/stamp-ots';
import type { StampEnvelope } from '@orangecheck/stamp-core';

import { die, emit, pathExists, readJson } from '../util.js';

export interface AnchorOptions {
    stampPath: string;
    json: boolean;
}

export async function runAnchor(opts: AnchorOptions): Promise<void> {
    if (!(await pathExists(opts.stampPath))) die(`no such file: ${opts.stampPath}`);
    const envelope = await readJson<StampEnvelope>(opts.stampPath);

    if (envelope.ots?.status === 'confirmed') {
        emit(opts.json, {
            ok: true,
            already: 'confirmed',
            block_height: envelope.ots.block_height,
        });
        return;
    }

    try {
        const proof = await submitToCalendars(envelope.id);
        const next: StampEnvelope = { ...envelope, ots: toStampOts(proof) };
        await writeFile(opts.stampPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
        emit(opts.json, {
            ok: true,
            id: next.id,
            status: next.ots?.status,
            calendars: next.ots?.calendars ?? [],
            written: opts.stampPath,
        });
    } catch (e) {
        die(`OTS submission failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}
