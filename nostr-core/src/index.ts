/**
 * @orangecheck/nostr-core
 *
 * Browser-compatible Nostr client used by every OrangeCheck family web
 * app. Raw NIP-01 over WebSocket against a list of relays. Every operation
 * races all relays in parallel and reports per-relay status so the caller
 * can distinguish "nobody replied" from "one relay rejected." Retries with
 * exponential backoff on transport errors only.
 *
 * Uses the platform `WebSocket` global. Works in any runtime that ships a
 * WHATWG WebSocket (browser, Node 22+, Deno, Bun, Cloudflare Workers).
 * `queryEvents` returns only events whose id and BIP-340 signature verify
 * and which match the filter (`@noble/curves` + `@noble/hashes`).
 *
 * Source-of-truth `DEFAULT_RELAYS` for the OC family. Co-publishes to four
 * public relays plus `wss://relay.ochk.io` (the family's first-party
 * kind-allowlisted relay — see https://github.com/orangecheck/oc-relay-infra).
 *
 * **Hard invariant:** `DEFAULT_RELAYS` MUST contain at least two entries,
 * and MUST NOT be `relay.ochk.io` alone. Enforced at the type level — a
 * future engineer simplifying to ours-only fails `tsc`. See `_validate`
 * below.
 */

import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

// ─────────────────────────────────────────────────────────────────────────
// Build-time invariants + default relay set.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Family-relay invariants applied to `DEFAULT_RELAYS`. The relay set must:
 *   1. Contain at least two relays — single-relay defaults are always wrong
 *      because the family's BYPASS principle requires public-relay co-publish.
 *   2. Not be `wss://relay.ochk.io` alone — relay.ochk.io is additive, never
 *      a single point of failure. See oc-relay-infra/BYPASS.md.
 *
 * If `T` violates either rule, this resolves to `never` and the assignment
 * below fails at `tsc` time.
 */
type ValidRelaySet<T extends readonly string[]> = T["length"] extends 0 | 1
  ? never
  : T extends readonly ["wss://relay.ochk.io"]
    ? never
    : T;

const _RELAYS: ValidRelaySet<
  readonly [
    "wss://nos.lol",
    "wss://relay.primal.net",
    "wss://offchain.pub",
    "wss://relay.snort.social",
    "wss://relay.ochk.io",
  ]
> = [
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://offchain.pub",
  // relay.nostr.band sat here until 2026-09-03, when it stopped accepting
  // TCP connections altogether (DNS resolves, port 443 never handshakes, and
  // the apex nostr.band is down too — from two independent networks).
  // relay.snort.social replaces it to keep the breadth this set exists for;
  // it answered every probe. Note it ACCEPTS unindexed tag filters by
  // ignoring them rather than rejecting, so it will happily return a flood of
  // unrelated events for a multi-letter filter — which the Filter type in
  // this file now makes impossible to express.
  "wss://relay.snort.social",
  // First-party family relay — kind allowlist 30078-30087 + 30110-30114 + canonical
  // OC d-tag prefixes. Always co-published with public relays; never
  // the only copy. See https://github.com/orangecheck/oc-relay-infra.
  "wss://relay.ochk.io",
] as const;

/**
 * Default relay set for OrangeCheck family Nostr publishes + queries.
 *
 * Frozen at runtime; consumers MAY pass an explicit `relays` arg to any
 * function in this package to override.
 *
 * @example
 * ```ts
 * import { DEFAULT_RELAYS, publishEvent } from '@orangecheck/nostr-core';
 *
 * const results = await publishEvent(myEvent);
 * // → publishes to all 5 relays in DEFAULT_RELAYS in parallel
 * console.log(`accepted on ${results.filter(r => r.ok).length}/${results.length}`);
 * ```
 */
export const DEFAULT_RELAYS: readonly string[] = Object.freeze([..._RELAYS]);

// ─────────────────────────────────────────────────────────────────────────
// Wire types — NIP-01 event + filter + result shapes.
// ─────────────────────────────────────────────────────────────────────────

export interface NostrEvent {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  sig: string;
}

export interface PublishResult {
  relay: string;
  ok: boolean;
  reason?: string;
  attempts: number;
}

/**
 * The tag names a relay is required to index.
 *
 * NIP-12 defines indexed tag filters over **single-letter** names only. A
 * filter on a multi-letter name (`#poll_id`, `#delegation`, `#address`) is
 * accepted by the wire format, forwarded, and then matches nothing on a
 * conforming relay — it fails silently and returns an empty set.
 *
 * This type used to name `'#poll_id'`, `'#voter'` and `'#creator'` as
 * legitimate filters ("Used by OC Vote"), with a `#${string}` catch-all that
 * permitted any other. That is how the same bug reached four codebases:
 * OC Vote's tally found zero ballots for every poll, OC Agent's revocation
 * lookup found zero revocations and therefore honoured revoked delegations,
 * and `@orangecheck/sdk`'s `check()` found zero attestations. Every one of
 * them was a filter the type system had blessed.
 *
 * Restricting the key space to single letters turns that class of bug into a
 * compile error. If you need to query by some value, the event has to carry
 * it in a single-letter tag — most often `t` — and that is a fact about
 * Nostr, not a preference.
 */
type IndexableTagName =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";

/** `#a` … `#Z` — the only tag filters a relay must honour. */
export type IndexableTagFilter = `#${IndexableTagName}`;

export interface Filter extends Partial<Record<IndexableTagFilter, string[]>> {
  kinds?: number[];
  authors?: string[];
  ids?: string[];
  limit?: number;
  since?: number;
  until?: number;
}

export interface QueryResult {
  events: NostrEvent[];
  relayStatus: {
    relay: string;
    /** The relay returned at least one verified, filter-matching event, or reached EOSE. */
    ok: boolean;
    /**
     * The relay sent EOSE: it finished answering, so an empty or short result
     * from it is complete. `ok` is also true when a relay timed out or closed
     * after sending some events; use `eose` for completeness.
     */
    eose: boolean;
    reason?: string;
    /** Verified, filter-matching events received from this relay. */
    events: number;
    /** Events from this relay dropped for a bad id, bad signature or filter mismatch. */
    rejected: number;
  }[];
}

// ─────────────────────────────────────────────────────────────────────────
// Event verification — NIP-01 id + BIP-340 signature + filter match.
// ─────────────────────────────────────────────────────────────────────────

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

/** NIP-01 event id: sha256 of `[0, pubkey, created_at, kind, tags, content]`. */
export function getEventHash(event: Omit<NostrEvent, "id" | "sig">): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return bytesToHex(sha256(utf8ToBytes(serialized)));
}

/**
 * True when `event` is well-formed, its `id` equals the NIP-01 hash of its
 * content, and `sig` is a valid BIP-340 signature of that id by `pubkey`.
 */
export function verifyEvent(event: unknown): event is NostrEvent {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;
  if (
    typeof e.id !== "string" ||
    typeof e.pubkey !== "string" ||
    typeof e.sig !== "string" ||
    typeof e.content !== "string" ||
    !Number.isSafeInteger(e.kind) ||
    !Number.isSafeInteger(e.created_at) ||
    !Array.isArray(e.tags) ||
    !e.tags.every(
      (t) => Array.isArray(t) && t.every((v) => typeof v === "string"),
    )
  )
    return false;
  if (!HEX64.test(e.id) || !HEX64.test(e.pubkey) || !HEX128.test(e.sig))
    return false;
  const ev = e as unknown as NostrEvent;
  if (getEventHash(ev) !== ev.id) return false;
  try {
    return schnorr.verify(ev.sig, ev.id, ev.pubkey);
  } catch {
    return false;
  }
}

/** True when `event` satisfies every constraint in `filter` (NIP-01 semantics; `limit` is ignored). */
export function matchFilter(event: NostrEvent, filter: Filter): boolean {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.since !== undefined && event.created_at < filter.since)
    return false;
  if (filter.until !== undefined && event.created_at > filter.until)
    return false;
  for (const [key, values] of Object.entries(filter)) {
    if (key[0] !== "#" || !Array.isArray(values)) continue;
    const name = key.slice(1);
    if (
      !event.tags.some(
        (t) => t[0] === name && t[1] !== undefined && values.includes(t[1]),
      )
    )
      return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Internal — frame parsing + retry config.
// ─────────────────────────────────────────────────────────────────────────

type FrameType = "OK" | "EVENT" | "EOSE" | "NOTICE" | "CLOSED" | "AUTH";
interface RelayFrame {
  type: FrameType;
  payload: unknown[];
}

/**
 * Sign a [NIP-42](https://nips.nostr.com/42) AUTH challenge. Given the relay's
 * `challenge` string and `relayUrl`, return a signed kind-22242 event (tags
 * `["relay", relayUrl]` + `["challenge", challenge]`). Passed in by the caller so
 * this package stays dependency-free (no crypto here). Provide it only for
 * `auth-required` relays; absent it, an AUTH challenge is ignored (today's behavior).
 */
export type AuthSigner = (
  challenge: string,
  relayUrl: string,
) => NostrEvent | Promise<NostrEvent>;

function parseFrame(raw: string): RelayFrame | null {
  try {
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const type = arr[0];
    if (
      type === "OK" ||
      type === "EVENT" ||
      type === "EOSE" ||
      type === "NOTICE" ||
      type === "CLOSED" ||
      type === "AUTH"
    ) {
      return { type: type as FrameType, payload: arr.slice(1) };
    }
    return null;
  } catch {
    return null;
  }
}

interface RetryOptions {
  attempts: number;
  timeoutMs: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  attempts: 3,
  timeoutMs: 5000,
  initialBackoffMs: 500,
  maxBackoffMs: 4000,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────
// Publish — write an event to one or more relays in parallel, with retry.
// ─────────────────────────────────────────────────────────────────────────

async function publishOne(
  url: string,
  event: NostrEvent,
  retry: RetryOptions,
  auth?: AuthSigner,
): Promise<PublishResult> {
  let attempts = 0;
  let backoff = retry.initialBackoffMs;
  let lastReason: string | undefined;

  while (attempts < retry.attempts) {
    attempts++;
    const attempt = await attemptPublish(url, event, retry.timeoutMs, auth);
    if (attempt.ok) {
      return {
        relay: url,
        ok: true,
        attempts,
        ...(attempt.reason ? { reason: attempt.reason } : {}),
      };
    }
    lastReason = attempt.reason;
    if (attempt.retryable && attempts < retry.attempts) {
      await delay(backoff);
      backoff = Math.min(backoff * 2, retry.maxBackoffMs);
      continue;
    }
    break;
  }
  return {
    relay: url,
    ok: false,
    attempts,
    ...(lastReason ? { reason: lastReason } : {}),
  };
}

function attemptPublish(
  url: string,
  event: NostrEvent,
  timeoutMs: number,
  auth?: AuthSigner,
): Promise<{ ok: boolean; reason?: string; retryable: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    let authed = false; // a NIP-42 AUTH handshake is attempted at most once
    let ws: WebSocket | null = null;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws?.close();
      } catch {}
      resolve({ ok: false, reason: "timeout", retryable: true });
    }, timeoutMs);
    try {
      ws = new WebSocket(url);
      ws.onopen = () => ws?.send(JSON.stringify(["EVENT", event]));
      ws.onmessage = (msg) => {
        const frame = parseFrame(msg.data as string);
        if (!frame) return;
        // NIP-42: an auth-required relay challenges before it accepts the
        // EVENT. Sign the challenge with the caller's signer, send AUTH,
        // then re-send the EVENT. Without an `auth` signer this is ignored.
        if (frame.type === "AUTH" && auth && !authed) {
          authed = true;
          const challenge = String(frame.payload[0] ?? "");
          void Promise.resolve(auth(challenge, url))
            .then((authEvent) => {
              ws?.send(JSON.stringify(["AUTH", authEvent]));
              ws?.send(JSON.stringify(["EVENT", event]));
            })
            .catch(() => {
              /* signer failed → let the attempt time out / fail */
            });
          return;
        }
        if (frame.type === "OK" && frame.payload[0] === event.id) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            ws?.close();
          } catch {}
          const ok = frame.payload[1] === true;
          const reason = frame.payload[2] as string | undefined;
          resolve({
            ok,
            ...(reason ? { reason } : {}),
            retryable: false,
          });
        }
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, reason: "websocket_error", retryable: true });
      };
      ws.onclose = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, reason: "closed_early", retryable: true });
      };
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        reason: err instanceof Error ? err.message : "unknown",
        retryable: true,
      });
    }
  });
}

/**
 * Publish a NIP-01 event to all `relays` in parallel. Returns one
 * `PublishResult` per relay. Default timeout 5000ms.
 */
export async function publishEvent(
  event: NostrEvent,
  relays: readonly string[] = DEFAULT_RELAYS,
  timeoutMs = 5000,
  auth?: AuthSigner,
): Promise<PublishResult[]> {
  const retry: RetryOptions = { ...DEFAULT_RETRY, timeoutMs };
  return Promise.all(relays.map((r) => publishOne(r, event, retry, auth)));
}

// ─────────────────────────────────────────────────────────────────────────
// Query — REQ → EOSE → close. Races all relays; first to EOSE wins.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Issue a NIP-01 REQ across all `relays` in parallel. Returns deduplicated
 * events sorted newest-first plus per-relay status.
 *
 * Every event a relay returns is checked before it is kept: the id is
 * recomputed, the signature verified, and the filter re-applied. Events that
 * fail are dropped and counted in that relay's `rejected`; dedupe is keyed on
 * the verified id only.
 *
 * Default timeout 1500ms — short enough that a momentary blip on any one
 * relay (including relay.ochk.io) never holds up the racing reads. Pass an
 * explicit `timeoutMs` for slow filters or for use cases where waiting on
 * the slowest relay matters.
 */
export async function queryEvents(
  filter: Filter,
  relays: readonly string[] = DEFAULT_RELAYS,
  timeoutMs = 1500,
  auth?: AuthSigner,
): Promise<QueryResult> {
  const subId = "ocnc-" + Math.random().toString(36).slice(2, 10);
  const byId = new Map<string, NostrEvent>();
  const status: QueryResult["relayStatus"] = [];

  await Promise.all(
    relays.map(
      (url) =>
        new Promise<void>((resolve) => {
          let settled = false;
          let authed = false; // NIP-42 handshake attempted at most once
          let count = 0;
          let rejected = 0;
          let reason: string | undefined;
          let ws: WebSocket | null = null;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try {
              ws?.close();
            } catch {}
            status.push({
              relay: url,
              ok: count > 0,
              eose: false,
              reason: reason ?? "timeout",
              events: count,
              rejected,
            });
            resolve();
          }, timeoutMs);
          try {
            ws = new WebSocket(url);
            ws.onopen = () => ws?.send(JSON.stringify(["REQ", subId, filter]));
            ws.onmessage = (msg) => {
              const frame = parseFrame(msg.data as string);
              if (!frame) return;
              // NIP-42: auth-required relay challenges before serving the
              // REQ — sign, send AUTH, then re-send the REQ. Ignored absent
              // an `auth` signer (today's behavior).
              if (frame.type === "AUTH" && auth && !authed) {
                authed = true;
                const challenge = String(frame.payload[0] ?? "");
                void Promise.resolve(auth(challenge, url))
                  .then((authEvent) => {
                    ws?.send(JSON.stringify(["AUTH", authEvent]));
                    ws?.send(JSON.stringify(["REQ", subId, filter]));
                  })
                  .catch(() => {
                    /* signer failed → let the query time out */
                  });
                return;
              }
              if (frame.type === "EVENT" && frame.payload[0] === subId) {
                const event = frame.payload[1];
                if (verifyEvent(event) && matchFilter(event, filter)) {
                  if (!byId.has(event.id)) byId.set(event.id, event);
                  count++;
                } else {
                  rejected++;
                }
              } else if (frame.type === "EOSE" && frame.payload[0] === subId) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try {
                  ws?.send(JSON.stringify(["CLOSE", subId]));
                  ws?.close();
                } catch {}
                status.push({ relay: url, ok: true, eose: true, events: count, rejected });
                resolve();
              } else if (
                frame.type === "CLOSED" &&
                frame.payload[0] === subId
              ) {
                // The relay ENDED the subscription — it will send
                // nothing further. Without this branch the client
                // waited out the whole timeout for an answer that
                // had already arrived, and then reported 'timeout'
                // while discarding the relay's own explanation.
                //
                // Not theoretical: strfry CLOSEs a sub whose filter
                // uses an unindexed multi-letter tag, and
                // relay.snort.social is in DEFAULT_RELAYS. One such
                // relay added the full timeout to every query —
                // 8s on chat's device lookup, which is on the
                // deliverability path.
                //
                // `ok` still keys off whether events actually
                // arrived: a relay may stream some and then close.
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try {
                  ws?.close();
                } catch {}
                status.push({
                  relay: url,
                  ok: count > 0,
                  eose: false,
                  reason: String(frame.payload[1] ?? "closed"),
                  events: count,
              rejected,
                });
                resolve();
              } else if (frame.type === "NOTICE") {
                reason = String(frame.payload[0] ?? "notice");
              }
            };
            ws.onerror = () => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              status.push({
                relay: url,
                ok: false,
                eose: false,
                reason: "ws_error",
                events: count,
              rejected,
              });
              resolve();
            };
            ws.onclose = () => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              status.push({
                relay: url,
                ok: count > 0,
                eose: false,
                reason: reason ?? "closed_early",
                events: count,
              rejected,
              });
              resolve();
            };
          } catch (err) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            status.push({
              relay: url,
              ok: false,
              eose: false,
              reason: err instanceof Error ? err.message : "unknown",
              events: count,
              rejected,
            });
            resolve();
          }
        }),
    ),
  );

  return {
    events: Array.from(byId.values()).sort(
      (a, b) => b.created_at - a.created_at,
    ),
    relayStatus: status,
  };
}
