# OrangeCheck SDK Integration Guide

This guide will help you integrate OrangeCheck Protocol into your application.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Concepts](#core-concepts)
3. [Common Use Cases](#common-use-cases)
4. [Best Practices](#best-practices)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Installation

```bash
yarn add @orangecheck/sdk
```

### Basic Verification Flow

```typescript
import { computeMetrics, verifySignature } from '@orangecheck/sdk';

async function verifyAttestation(address: string, message: string, signature: string) {
    // 1. Verify the signature
    const verification = await verifySignature(message, signature, address);

    if (!verification.valid) {
        throw new Error('Invalid signature');
    }

    // 2. Compute reputation metrics
    const metrics = await computeMetrics(address);

    return {
        verified: true,
        metrics,
        scheme: verification.scheme,
    };
}
```

---

## Core Concepts

### 1. Canonical Messages

OrangeCheck uses a canonical message format (OCP v0) with 7 fixed lines:

```
OrangeCheck v0
Address: bc1q...
Timestamp: 1234567890
Identities: nostr:npub1..., github:username
Extensions: app=myapp, version=1.0.0
Nonce: random-nonce
Challenge: optional-challenge
```

**Creating a canonical message:**

```typescript
import { createCanonicalMessage } from '@orangecheck/sdk/canonical';

const message = createCanonicalMessage({
    address: 'bc1q...',
    timestamp: Date.now(),
    identities: ['nostr:npub1...', 'github:username'],
    extensions: {
        app: 'myapp',
        version: '1.0.0',
    },
});
```

### 2. Signature Verification

OrangeCheck supports two signature schemes:

- **BIP-322** (recommended): Modern Bitcoin message signing
- **Legacy**: Traditional Bitcoin message signing

```typescript
import { verifySignature } from '@orangecheck/sdk/verify';

const result = await verifySignature(message, signature, address);

if (result.valid) {
    console.log('Signature verified!');
    console.log('Scheme:', result.scheme); // 'bip322' or 'legacy'
} else {
    console.error('Invalid signature:', result.error);
}
```

### 3. Reputation Metrics

Metrics are computed from confirmed UTXOs:

```typescript
import { computeMetrics } from '@orangecheck/sdk/verify';

const metrics = await computeMetrics('bc1q...');

console.log('Bonded:', metrics.sats_bonded, 'sats');
console.log('Days unspent:', metrics.days_unspent);
console.log('Score:', metrics.score);
```

### 4. Scoring Algorithms

Multiple scoring algorithms are available:

```typescript
import { computeScore, formatScore } from '@orangecheck/sdk/scoring';

const score = computeScore(sats, days, { algorithm: 'tier' });
const formatted = formatScore(score, 'tier'); // "Tier 3 (Gold)"
```

**Available algorithms:**

- `v0`: Reference implementation (bond-based)
- `tier`: Bronze/Silver/Gold/Platinum tiers
- `time-weighted`: Emphasizes long-term holding
- `amount-weighted`: Emphasizes larger balances
- `threshold`: Pass/fail based on minimum requirements
- `none`: No scoring

---

## Common Use Cases

### Use Case 1: User Registration with Bitcoin Reputation

```typescript
import { computeMetrics, computeScore, verifySignature } from '@orangecheck/sdk';

async function registerUser(address: string, message: string, signature: string) {
    // Verify signature
    const verification = await verifySignature(message, signature, address);
    if (!verification.valid) {
        throw new Error('Invalid signature');
    }

    // Get reputation metrics
    const metrics = await computeMetrics(address);

    // Compute tier score
    const tier = computeScore(metrics.sats_bonded, metrics.days_unspent, {
        algorithm: 'tier',
    });

    // Save user with reputation
    await saveUser({
        address,
        tier,
        metrics,
        verified_at: new Date(),
    });

    return { success: true, tier };
}
```

### Use Case 2: Publishing Attestations to Nostr

```typescript
import { publishAttestation } from '@orangecheck/sdk/attestation';

async function createAndPublishAttestation(
    address: string,
    message: string,
    signature: string,
    identities: string[]
) {
    const result = await publishAttestation({
        canonicalMessage: message,
        signature,
        address,
        identities,
        relays: ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol'],
    });

    console.log('Attestation ID:', result.attestation_id);
    console.log('Published to:', result.published_relays.length, 'relays');

    return result.attestation_id;
}
```

### Use Case 3: Verifying Identity Bindings

```typescript
import { verifyIdentity } from '@orangecheck/sdk/identity';

async function verifyUserIdentities(
    attestationId: string,
    identities: Array<{ protocol: string; identifier: string; proof?: string }>
) {
    const results = await Promise.all(
        identities.map(async (identity) => {
            const result = await verifyIdentity(attestationId, identity);
            return {
                ...identity,
                verified: result.verified,
                error: result.error,
            };
        })
    );

    const verified = results.filter((r) => r.verified);
    const failed = results.filter((r) => !r.verified);

    return { verified, failed };
}
```

### Use Case 4: Fetching Attestations from Nostr

```typescript
import { getAttestation, getAttestationsForAddress } from '@orangecheck/sdk/attestation';

// Get specific attestation
async function getAttestationById(id: string) {
    const attestation = await getAttestation(id);

    if (!attestation) {
        throw new Error('Attestation not found');
    }

    return attestation;
}

// Get all attestations for an address
async function getUserAttestations(address: string) {
    const attestations = await getAttestationsForAddress(address);

    return attestations.map((att) => ({
        id: att.attestation_id,
        timestamp: att.timestamp,
        identities: att.identities,
    }));
}
```

---

## Best Practices

### 1. Error Handling

Always handle errors gracefully:

```typescript
try {
    const result = await verifySignature(message, signature, address);
    if (!result.valid) {
        // Handle invalid signature
        console.error('Signature verification failed:', result.error);
    }
} catch (error) {
    // Handle network errors, etc.
    console.error('Verification error:', error);
}
```

### 2. Caching

Cache metrics to avoid repeated API calls:

```typescript
const metricsCache = new Map<string, { metrics: Metrics; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedMetrics(address: string) {
    const cached = metricsCache.get(address);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.metrics;
    }

    const metrics = await computeMetrics(address);
    metricsCache.set(address, { metrics, timestamp: Date.now() });

    return metrics;
}
```

### 3. Rate Limiting

Implement rate limiting for API calls:

```typescript
import { createRateLimiter, enforceRateLimit } from '@orangecheck/sdk';

const limiter = createRateLimiter(10, 60000); // 10 requests per minute

async function rateLimitedVerify(address: string, message: string, signature: string) {
    enforceRateLimit(limiter, address);
    return await verifySignature(message, signature, address);
}
```

### 4. Logging

Enable logging for debugging:

```typescript
import { setLogLevel } from '@orangecheck/sdk';

// In development
setLogLevel('debug');

// In production
setLogLevel('error');
```

---

## Troubleshooting

### Issue: "Signature verification failed"

**Possible causes:**

- Incorrect signature format
- Wrong address
- Message doesn't match canonical format

**Solution:**

```typescript
// Ensure message is canonical
const message = createCanonicalMessage({ ... });

// Try both schemes
const bip322Result = await verifySignature(message, signature, address, 'bip322');
const legacyResult = await verifySignature(message, signature, address, 'legacy');
```

### Issue: "No UTXOs found"

**Possible causes:**

- Address has no confirmed transactions
- Using testnet address on mainnet
- Network connectivity issues

**Solution:**

```typescript
// Check network
const result = await verifySignature(message, signature, address);
console.log('Network:', result.network);

// Use testMode for testnet
const metrics = await computeMetrics(address, { testMode: true });
```

### Issue: "Rate limit exceeded"

**Solution:**

```typescript
// Implement exponential backoff
async function retryWithBackoff(fn: () => Promise<any>, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (error.message.includes('rate limit') && i < maxRetries - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
            } else {
                throw error;
            }
        }
    }
}
```

---

## Next Steps

- Read the [API Reference](./README.md)
- Check out [example projects](https://github.com/yourusername/oc-examples)
- Join the community (link TBD)

## Support

- GitHub Issues: https://github.com/yourusername/oc-web/issues
- Email: support@ochk.io
