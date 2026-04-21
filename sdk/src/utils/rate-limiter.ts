/**
 * Simple in-memory rate limiter
 */

/**
 * Rate limiter configuration
 */
export interface RateLimiter {
    /** Maximum number of requests allowed in the time window */
    readonly maxRequests: number;
    /** Time window in milliseconds */
    readonly windowMs: number;
    /** Internal request tracking map */
    readonly requests: Map<string, number[]>;
}

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
    constructor(message = 'Rate limit exceeded. Please try again later.') {
        super(message);
        this.name = 'RateLimitError';
    }
}

/**
 * Create a rate limiter
 * @param maxRequests - Maximum requests allowed in the time window
 * @param windowMs - Time window in milliseconds
 * @returns Rate limiter instance
 */
export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
    if (maxRequests <= 0) {
        throw new Error('maxRequests must be greater than 0');
    }
    if (windowMs <= 0) {
        throw new Error('windowMs must be greater than 0');
    }

    return {
        maxRequests,
        windowMs,
        requests: new Map<string, number[]>(),
    };
}

/**
 * Check if a request is within rate limits
 * @param limiter - Rate limiter instance
 * @param key - Unique key for the request (e.g., user ID, IP address)
 * @returns True if request is allowed, false if rate limit exceeded
 */
export function checkRateLimit(limiter: RateLimiter, key: string): boolean {
    const now = Date.now();
    const requests = limiter.requests.get(key) ?? [];

    // Remove old requests outside the window
    const validRequests = requests.filter((timestamp) => now - timestamp < limiter.windowMs);

    // Check if limit exceeded
    if (validRequests.length >= limiter.maxRequests) {
        return false;
    }

    // Add new request
    validRequests.push(now);
    limiter.requests.set(key, validRequests);

    return true;
}

/**
 * Enforce rate limit, throwing an error if exceeded
 * @param limiter - Rate limiter instance
 * @param key - Unique key for the request
 * @throws {RateLimitError} If rate limit is exceeded
 */
export function enforceRateLimit(limiter: RateLimiter, key: string): void {
    if (!checkRateLimit(limiter, key)) {
        throw new RateLimitError();
    }
}

/**
 * Get remaining requests for a key
 * @param limiter - Rate limiter instance
 * @param key - Unique key for the request
 * @returns Number of remaining requests in the current window
 */
export function getRemainingRequests(limiter: RateLimiter, key: string): number {
    const now = Date.now();
    const requests = limiter.requests.get(key) ?? [];
    const validRequests = requests.filter((timestamp) => now - timestamp < limiter.windowMs);
    return Math.max(0, limiter.maxRequests - validRequests.length);
}

/**
 * Reset rate limit for a key
 * @param limiter - Rate limiter instance
 * @param key - Unique key to reset
 */
export function resetRateLimit(limiter: RateLimiter, key: string): void {
    limiter.requests.delete(key);
}

/**
 * Default rate limiter for identity verification
 * 5 requests per minute
 */
export const identityVerificationLimiter = createRateLimiter(5, 60000);
