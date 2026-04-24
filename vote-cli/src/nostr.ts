// Minimal NIP-01 WebSocket client for oc-vote. Node-native via the `ws` package.

import WebSocket from 'ws';

export interface NostrEvent {
    id: string;
    kind: number;
    pubkey: string;
    created_at: number;
    content: string;
    tags: string[][];
    sig: string;
}

export interface Filter {
    kinds?: number[];
    '#d'?: string[];
    '#poll_id'?: string[];
    limit?: number;
}

export const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social',
];

export async function queryRelays(
    filter: Filter,
    relays: string[] = DEFAULT_RELAYS,
    timeoutMs = 8000
): Promise<NostrEvent[]> {
    const byId = new Map<string, NostrEvent>();
    await Promise.all(
        relays.map(
            (url) =>
                new Promise<void>((resolve) => {
                    const subId = 'ocvcli-' + Math.random().toString(36).slice(2, 10);
                    let settled = false;
                    let ws: WebSocket | null = null;
                    const timer = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        try {
                            ws?.close();
                        } catch {}
                        resolve();
                    }, timeoutMs);
                    try {
                        ws = new WebSocket(url);
                        ws.on('open', () => ws?.send(JSON.stringify(['REQ', subId, filter])));
                        ws.on('message', (raw: WebSocket.RawData) => {
                            try {
                                const arr = JSON.parse(raw.toString()) as unknown[];
                                if (!Array.isArray(arr) || arr.length === 0) return;
                                if (arr[0] === 'EVENT' && arr[1] === subId) {
                                    const event = arr[2] as NostrEvent;
                                    if (event?.id) byId.set(event.id, event);
                                } else if (arr[0] === 'EOSE' && arr[1] === subId) {
                                    if (settled) return;
                                    settled = true;
                                    clearTimeout(timer);
                                    try {
                                        ws?.send(JSON.stringify(['CLOSE', subId]));
                                        ws?.close();
                                    } catch {}
                                    resolve();
                                }
                            } catch {
                                // ignore parse errors
                            }
                        });
                        ws.on('error', () => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);
                            resolve();
                        });
                        ws.on('close', () => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);
                            resolve();
                        });
                    } catch {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            resolve();
                        }
                    }
                })
        )
    );
    return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
}

export async function fetchPollEvent(pollId: string, relays?: string[]) {
    const events = await queryRelays(
        { kinds: [30080], '#d': [`oc-vote:poll:${pollId}`], limit: 1 },
        relays
    );
    return events[0] ?? null;
}

export async function fetchBallotEvents(pollId: string, relays?: string[]) {
    return queryRelays({ kinds: [30081], '#poll_id': [pollId] }, relays);
}

export async function fetchRevealEvent(pollId: string, relays?: string[]) {
    const events = await queryRelays(
        { kinds: [30082], '#d': [`oc-vote:reveal:${pollId}`], limit: 1 },
        relays
    );
    return events[0] ?? null;
}
