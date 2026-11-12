/** Real BTCPay events are well under 1 KB. */
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

/** What a Node request offers: the stream a webhook's signature is checked over. */
export interface BodyStream {
    on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
    on(event: 'end', listener: () => void): unknown;
    on(event: 'error', listener: (err: Error) => void): unknown;
    destroy(): unknown;
}

/**
 * Read a request's raw body, the bytes BTCPay signed. Rejects with
 * `payload_too_large` past `maxBytes`, and stops reading there.
 */
export function readRawBody(
    req: BodyStream,
    maxBytes: number = MAX_WEBHOOK_BODY_BYTES
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        req.on('data', (c) => {
            if (done) return;
            const chunk = typeof c === 'string' ? Buffer.from(c) : c;
            size += chunk.length;
            if (size > maxBytes) {
                done = true;
                req.destroy();
                reject(new Error('payload_too_large'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (!done) resolve(Buffer.concat(chunks));
        });
        req.on('error', (err) => {
            if (!done) reject(err);
        });
    });
}
