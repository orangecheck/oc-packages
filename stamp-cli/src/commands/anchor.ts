// `stamp anchor <stamp-path>` — advance a stamp's OTS proof: submit its id to
// the calendars when it has none, ask the listed calendars to upgrade a
// pending one, leave a confirmed one alone. From `-`, the stamp goes to stdout
// and the summary to stderr.

import { writeFile } from 'node:fs/promises';

import type { StampEnvelope } from '@orangecheck/stamp-core';
import { mempoolHeaderSource } from '@orangecheck/stamp-ots';

import { advanceOts, otsFailure } from '../anchor-check.js';
import { die, emit, isStdin, pathExists, readStamp } from '../util.js';

export interface AnchorOptions {
    stampPath: string;
    /** Esplora-compatible API for block headers. Default mempool.space. */
    headersUrl?: string;
    json: boolean;
}

export async function runAnchor(opts: AnchorOptions): Promise<void> {
    const piped = isStdin(opts.stampPath);
    if (!piped && !(await pathExists(opts.stampPath))) die(`no such file: ${opts.stampPath}`);
    const envelope = await readStamp(opts.stampPath);
    const summaryTo = piped ? 'stderr' : 'stdout';

    if (envelope.ots?.status === 'confirmed') {
        if (piped) process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
        emit(
            opts.json,
            {
                ok: true,
                already: 'confirmed',
                block_height: envelope.ots.block_height,
            },
            summaryTo
        );
        return;
    }

    let next: StampEnvelope;
    try {
        next = await advanceOts(envelope, {
            headers: mempoolHeaderSource({ baseUrl: opts.headersUrl }),
        });
    } catch (e) {
        die(otsFailure(e, Boolean(envelope.ots)));
    }
    const changed = JSON.stringify(next.ots) !== JSON.stringify(envelope.ots);
    if (piped) {
        // Unchanged too, so `stamp anchor - < a.stamp > b.stamp` always leaves a stamp in b.stamp.
        process.stdout.write(JSON.stringify(next, null, 2) + '\n');
    } else if (changed) {
        await writeFile(opts.stampPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    }
    emit(
        opts.json,
        {
            ok: true,
            id: next.id,
            status: next.ots?.status,
            block_height: next.ots?.block_height ?? null,
            calendars: next.ots?.calendars ?? [],
            written: piped ? 'stdout' : changed ? opts.stampPath : null,
        },
        summaryTo
    );
}
