import { isIP, type LookupFunction } from 'node:net';

import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';

import type { Pin } from './domain.js';
import type { FetchLike } from './http.js';

/** A lookup that answers every name with the addresses already checked: the connection never asks DNS again. */
export function pinnedLookup(addresses: string[]): LookupFunction {
    const answers = addresses.map((address) => ({ address, family: isIP(address) }));
    return (_hostname, options, callback) => {
        if (options.all) callback(null, answers);
        else callback(null, answers[0]!.address, answers[0]!.family);
    };
}

/** Fetches over a connection to the checked addresses; TLS still verifies the certificate for the URL's host. */
export const pinnedFetch: Pin = (addresses) => {
    if (addresses.length === 0) throw new Error('no address to connect to');
    const dispatcher = new Agent({ connect: { lookup: pinnedLookup(addresses) } });
    const fetchImpl: FetchLike = async (input, init) =>
        (await undiciFetch(input, { ...(init as UndiciRequestInit), dispatcher })) as unknown as Response;
    return { fetch: fetchImpl, close: () => dispatcher.destroy() };
};
