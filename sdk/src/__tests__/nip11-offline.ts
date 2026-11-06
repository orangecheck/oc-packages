// A NIP-11 GET in a test answers 404, as a relay with no document does, unless the test stubs fetch itself.
const online = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (new Headers(init?.headers).get('accept') === 'application/nostr+json') {
        return new Response('no NIP-11 document in tests', { status: 404 });
    }
    return online(input, init);
}) as typeof globalThis.fetch;
