// `stamp anchor <stamp-path>` — advance a stamp's OTS proof: submit its id to
// the calendars when it has none, ask the listed calendars to upgrade a
// pending one, leave a confirmed one alone.

import { writeFile } from 'node:fs/promises';

import type { StampEnvelope } from '@orangecheck/stamp-core';
import { mempoolHeaderSource } from '@orangecheck/stamp-ots';

import { advanceOts } from '../anchor-check.js';
import { die, emit, pathExists, readJson } from '../util.js';

export interface AnchorOptions {
    stampPath: string;
    /** Esplora-compatible API for block headers. Default mempool.space. */
    headersUrl?: string;
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

    let next: StampEnvelope;
    try {
        next = await advanceOts(envelope, {
            headers: mempoolHeaderSource({ baseUrl: opts.headersUrl }),
        });
    } catch (e) {
        die(`OTS ${envelope.ots ? 'upgrade' : 'submission'} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    const changed = JSON.stringify(next.ots) !== JSON.stringify(envelope.ots);
    if (changed) {
        await writeFile(opts.stampPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    }
    emit(opts.json, {
        ok: true,
        id: next.id,
        status: next.ots?.status,
        block_height: next.ots?.block_height ?? null,
        calendars: next.ots?.calendars ?? [],
        written: changed ? opts.stampPath : null,
    });
}
