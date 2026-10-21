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
 * In a browser, calls share one socket per relay (see `configureRelayPool`).
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
    "wss://relay.damus.io",
    "wss://nostr.oxtr.dev",
    "wss://relay.ochk.io",
  ]
> = [
  // A relay is here only if it answers OK true to the family's kinds from a
  // fresh key and still serves the event an hour later
  // (research/RELAY-COVERAGE-DECISIONS.md, scripts/relay_coverage_check.mjs).
  // relay.snort.social (in memory since 2026-10: OK true, then nothing) and
  // offchain.pub (web of trust refuses fresh keys) left on 2026-10-21;
  // relay.nostr.band left on 2026-09-03 when it stopped answering at all.
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://nostr.oxtr.dev",
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
// Transport — one socket per call, or one pooled socket per relay per page.
// ─────────────────────────────────────────────────────────────────────────

/** What a call sees of its relay connection: when it may send, the frames, and the end. */
interface ChannelHandlers {
  open(): void;
  frame(frame: RelayFrame): void;
  /** The socket failed (`error`) or closed (`close`) before the call finished. */
  down(kind: "error" | "close", detail?: string): void;
}

interface Channel {
  send(frame: unknown[]): void;
  /** The call is done with the relay: a direct socket closes, a pooled one is released. */
  end(): void;
}

export interface RelayPoolOptions {
  /**
   * Share one socket per relay among every call on the page. Defaults to on in
   * a browser and off elsewhere, where a module-level socket would outlive a
   * serverless request.
   */
  enabled: boolean;
  /** Subscriptions open at once on one relay; further queries wait their turn. */
  maxSubscriptions: number;
  /**
   * After a refused handshake, dial once more after this long, but only when
   * the earliest waiting call's deadline leaves room for it. 0 turns it off.
   */
  redialMs: number;
  /** After a relay refuses the handshake, calls skip it this long ("relay_unavailable"). */
  backoffMs: number;
  /** A pooled socket with nothing on it closes after this long. */
  idleMs: number;
}

const poolOptions: RelayPoolOptions = {
  enabled: typeof window !== "undefined" && typeof document !== "undefined",
  // The smallest max_subscriptions in the family's relays is 20 (relay.ochk.io,
  // primal); 10 leaves room for long-lived subscriptions on the same socket.
  maxSubscriptions: 10,
  // relay.damus.io refuses about one handshake in seven with a 503, unrelated
  // to load from us; a second try half a second later usually gets through.
  redialMs: 500,
  backoffMs: 10_000,
  idleMs: 30_000,
};

/** Change how calls share relay sockets. See {@link RelayPoolOptions}. */
export function configureRelayPool(options: Partial<RelayPoolOptions>): void {
  Object.assign(poolOptions, options);
}

/** Close every pooled socket and forget which relays are backing off. */
export function closeRelayPool(): void {
  for (const relay of [...pool.values()]) relay.shutdown();
  pool.clear();
  unavailableUntil.clear();
}

function directChannel(url: string, h: ChannelHandlers): Channel {
  let ws: WebSocket | null = null;
  try {
    ws = new WebSocket(url);
    ws.onopen = () => h.open();
    ws.onmessage = (msg) => {
      const frame = parseFrame(msg.data as string);
      if (frame) h.frame(frame);
    };
    ws.onerror = () => h.down("error");
    ws.onclose = () => h.down("close");
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    queueMicrotask(() => h.down("error", detail));
  }
  return {
    send: (frame) => {
      try {
        ws?.send(JSON.stringify(frame));
      } catch {}
    },
    end: () => {
      try {
        ws?.close();
      } catch {}
    },
  };
}

interface Member {
  h: ChannelHandlers;
  /** Holds a subscription slot while open (queries), or needs none (publishes). */
  subscription: boolean;
  slot: boolean;
  started: boolean;
  done: boolean;
  /** When the call gives up (ms since epoch); Infinity for a subscription. */
  deadline: number;
}

const pool = new Map<string, PooledRelay>();
const unavailableUntil = new Map<string, number>();

/** One socket to one relay, shared by every call on the page. */
class PooledRelay {
  private ws: WebSocket | null = null;
  private opened = false;
  private readonly members = new Set<Member>();
  private queue: Member[] = [];
  private slots = 0;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private redial: ReturnType<typeof setTimeout> | null = null;
  private redialed = false;

  constructor(readonly url: string) {}

  join(h: ChannelHandlers, subscription: boolean, deadline: number): Channel {
    const m: Member = { h, subscription, slot: false, started: false, done: false, deadline };
    this.members.add(m);
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    if (subscription) {
      if (this.slots < poolOptions.maxSubscriptions) {
        this.slots++;
        m.slot = true;
      } else {
        this.queue.push(m);
      }
    }
    this.dial();
    if (this.opened) this.startLater(m);
    return {
      send: (frame) => {
        if (!this.ws || !this.opened) return;
        try {
          this.ws.send(JSON.stringify(frame));
        } catch {}
      },
      end: () => this.leave(m),
    };
  }

  shutdown(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    if (this.redial) clearTimeout(this.redial);
    this.redial = null;
    this.drop();
    this.members.clear();
    this.queue = [];
    this.slots = 0;
  }

  private ready(m: Member): boolean {
    return !m.done && !m.started && (!m.subscription || m.slot);
  }

  private startLater(m: Member): void {
    if (!this.ready(m)) return;
    m.started = true;
    queueMicrotask(() => {
      if (!m.done) m.h.open();
    });
  }

  private dial(): void {
    if (this.ws || this.redial) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      queueMicrotask(() => this.fail("error", detail));
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.opened = true;
      for (const m of [...this.members]) {
        if (!this.ready(m)) continue;
        m.started = true;
        m.h.open();
      }
    };
    ws.onmessage = (msg) => {
      const frame = parseFrame(msg.data as string);
      if (!frame) return;
      // Each call keeps only frames for its own sub id or event id.
      for (const m of [...this.members]) if (m.started && !m.done) m.h.frame(frame);
    };
    ws.onerror = () => this.fail("error");
    ws.onclose = () => this.fail("close");
  }

  /**
   * The socket is gone: every call on it settles, and a refused handshake
   * backs the relay off. The first refusal gets one redial instead, if every
   * waiting call can still wait for it.
   */
  private fail(kind: "error" | "close", detail?: string): void {
    if (!this.opened) {
      if (this.redialAllowed()) {
        this.redialed = true;
        this.detach();
        this.redial = setTimeout(() => {
          this.redial = null;
          if ([...this.members].some((m) => !m.done)) this.dial();
          else this.shutdown();
        }, poolOptions.redialMs);
        return;
      }
      unavailableUntil.set(this.url, Date.now() + poolOptions.backoffMs);
    }
    this.drop();
    const members = [...this.members];
    this.members.clear();
    this.queue = [];
    this.slots = 0;
    for (const m of members) {
      if (m.done) continue;
      m.done = true;
      m.h.down(kind, detail);
    }
  }

  private redialAllowed(): boolean {
    if (this.redialed || poolOptions.redialMs <= 0) return false;
    const waiting = [...this.members].filter((m) => !m.done);
    if (waiting.length === 0) return false;
    const earliest = Math.min(...waiting.map((m) => m.deadline));
    return earliest - Date.now() > poolOptions.redialMs;
  }

  /** Let go of the socket but keep this relay's calls and pool entry. */
  private detach(): void {
    const ws = this.ws;
    this.ws = null;
    this.opened = false;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try {
      ws.close();
    } catch {}
  }

  private drop(): void {
    const ws = this.ws;
    this.ws = null;
    this.opened = false;
    if (pool.get(this.url) === this) pool.delete(this.url);
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try {
      ws.close();
    } catch {}
  }

  private leave(m: Member): void {
    if (!this.members.has(m)) return;
    m.done = true;
    this.members.delete(m);
    const queued = this.queue.indexOf(m);
    if (queued >= 0) this.queue.splice(queued, 1);
    if (m.slot) {
      m.slot = false;
      this.slots--;
      while (this.slots < poolOptions.maxSubscriptions && this.queue.length > 0) {
        const next = this.queue.shift()!;
        next.slot = true;
        this.slots++;
        if (this.opened) this.startLater(next);
      }
    }
    if (this.members.size === 0) {
      this.idle = setTimeout(() => {
        if (this.members.size === 0) this.shutdown();
      }, poolOptions.idleMs);
      (this.idle as { unref?: () => void }).unref?.();
    }
  }
}

/**
 * A channel to `url` for one call, or null while the relay is backing off.
 * A call with an AUTH signer gets its own socket: one identity's AUTH is never
 * shared with other calls.
 */
function openChannel(
  url: string,
  h: ChannelHandlers,
  opts: { subscription: boolean; auth?: AuthSigner; deadline?: number },
): Channel | null {
  if (!poolOptions.enabled || opts.auth) return directChannel(url, h);
  const until = unavailableUntil.get(url);
  if (until !== undefined) {
    if (Date.now() < until) return null;
    unavailableUntil.delete(url);
  }
  let relay = pool.get(url);
  if (!relay) {
    relay = new PooledRelay(url);
    pool.set(url, relay);
  }
  return relay.join(h, opts.subscription, opts.deadline ?? Infinity);
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
    let channel: Channel | null = null;
    const finish = (r: { ok: boolean; reason?: string; retryable: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel?.end();
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ ok: false, reason: "timeout", retryable: true }),
      timeoutMs,
    );
    channel = openChannel(
      url,
      {
        open: () => channel?.send(["EVENT", event]),
        frame: (frame) => {
          // NIP-42: an auth-required relay challenges before it accepts the
          // EVENT. Sign the challenge with the caller's signer, send AUTH,
          // then re-send the EVENT. Without an `auth` signer this is ignored.
          if (frame.type === "AUTH" && auth && !authed) {
            authed = true;
            const challenge = String(frame.payload[0] ?? "");
            void Promise.resolve(auth(challenge, url))
              .then((authEvent) => {
                channel?.send(["AUTH", authEvent]);
                channel?.send(["EVENT", event]);
              })
              .catch(() => {
                /* signer failed → let the attempt time out / fail */
              });
            return;
          }
          if (frame.type === "OK" && frame.payload[0] === event.id) {
            const reason = frame.payload[2] as string | undefined;
            finish({
              ok: frame.payload[1] === true,
              ...(reason ? { reason } : {}),
              retryable: false,
            });
          }
        },
        down: (kind, detail) =>
          finish({
            ok: false,
            reason: detail ?? (kind === "error" ? "websocket_error" : "closed_early"),
            retryable: true,
          }),
      },
      { subscription: false, auth, deadline: Date.now() + timeoutMs },
    );
    // The relay refused a handshake moments ago; retrying inside the back-off
    // would only dial into the same refusal.
    if (!channel) finish({ ok: false, reason: "relay_unavailable", retryable: false });
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

/**
 * What a publish achieved, across relays. A reader learns of an event only
 * from a relay that holds it, so a revocation or record is in effect for
 * anyone once at least one relay has accepted it, and not before. Each relay
 * counts once, as accepted if any attempt at it was.
 */
export interface PublishOutcome {
  kind: "none" | "partial" | "all";
  accepted: number;
  total: number;
  /** The relays that accepted it. */
  relays: string[];
}

export function publishOutcome(
  results: readonly Pick<PublishResult, "relay" | "ok">[],
): PublishOutcome {
  const byRelay = new Map<string, boolean>();
  for (const r of results) byRelay.set(r.relay, (byRelay.get(r.relay) ?? false) || r.ok);
  const relays = [...byRelay].filter(([, ok]) => ok).map(([relay]) => relay);
  const total = byRelay.size;
  return {
    kind: relays.length === 0 ? "none" : relays.length === total ? "all" : "partial",
    accepted: relays.length,
    total,
    relays,
  };
}

/**
 * Keep only the latest version of each replaceable event, as NIP-01 says a
 * relay should: per (kind, pubkey, d tag) for addressable kinds 30000–39999,
 * per (kind, pubkey) for kinds 0, 3 and 10000–19999. The highest `created_at`
 * wins; a tie goes to the lowest id. Other events pass through.
 *
 * `queryEvents` de-duplicates by id only, so when relays disagree an old and a
 * new version of the same record arrive side by side. Use this wherever a
 * reader wants the current version.
 */
export function latestByCoordinate<T extends NostrEvent>(events: readonly T[]): T[] {
  const latest = new Map<string, T>();
  const rest: T[] = [];
  for (const e of events) {
    const addressable = e.kind >= 30000 && e.kind < 40000;
    const replaceable = e.kind === 0 || e.kind === 3 || (e.kind >= 10000 && e.kind < 20000);
    if (!addressable && !replaceable) {
      rest.push(e);
      continue;
    }
    const d = addressable ? ((e.tags.find((t) => t[0] === "d") ?? [])[1] ?? "") : "";
    const key = `${e.kind}:${e.pubkey}:${d}`;
    const prev = latest.get(key);
    if (
      !prev ||
      e.created_at > prev.created_at ||
      (e.created_at === prev.created_at && e.id < prev.id)
    )
      latest.set(key, e);
  }
  return [...rest, ...latest.values()].sort((a, b) => b.created_at - a.created_at);
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
          let sent = false;
          let count = 0;
          let rejected = 0;
          let reason: string | undefined;
          let channel: Channel | null = null;
          const finish = (
            ok: boolean,
            eose: boolean,
            why: string | undefined,
            closeSub: boolean,
          ) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (closeSub && sent) channel?.send(["CLOSE", subId]);
            channel?.end();
            status.push({
              relay: url,
              ok,
              eose,
              ...(why ? { reason: why } : {}),
              events: count,
              rejected,
            });
            resolve();
          };
          // Started before the channel, so time spent waiting for a pooled
          // relay's subscription slot counts against this call's deadline.
          const timer = setTimeout(
            () => finish(count > 0, false, reason ?? "timeout", true),
            timeoutMs,
          );
          channel = openChannel(
            url,
            {
              open: () => {
                sent = true;
                channel?.send(["REQ", subId, filter]);
              },
              frame: (frame) => {
                // NIP-42: auth-required relay challenges before serving the
                // REQ — sign, send AUTH, then re-send the REQ. Ignored absent
                // an `auth` signer (today's behavior).
                if (frame.type === "AUTH" && auth && !authed) {
                  authed = true;
                  const challenge = String(frame.payload[0] ?? "");
                  void Promise.resolve(auth(challenge, url))
                    .then((authEvent) => {
                      channel?.send(["AUTH", authEvent]);
                      channel?.send(["REQ", subId, filter]);
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
                  finish(true, true, undefined, true);
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
                  // uses an unindexed multi-letter tag. One such relay
                  // added the full timeout to every query — 8s on
                  // chat's device lookup, which is on the
                  // deliverability path.
                  //
                  // `ok` still keys off whether events actually
                  // arrived: a relay may stream some and then close.
                  finish(count > 0, false, String(frame.payload[1] ?? "closed"), false);
                } else if (frame.type === "NOTICE") {
                  reason = String(frame.payload[0] ?? "notice");
                }
              },
              down: (kind, detail) =>
                kind === "error"
                  ? finish(false, false, detail ?? "ws_error", false)
                  : finish(count > 0, false, reason ?? "closed_early", false),
            },
            { subscription: true, auth, deadline: Date.now() + timeoutMs },
          );
          if (!channel) finish(false, false, "relay_unavailable", false);
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

// ─────────────────────────────────────────────────────────────────────────
// Subscribe — a long-lived REQ on every relay, kept open and re-sent on reconnect.
// ─────────────────────────────────────────────────────────────────────────

export type SubscriptionState = "open" | "eose" | "closed" | "error" | "unavailable";

export interface SubscribeOptions {
  /** Default `DEFAULT_RELAYS`. */
  relays?: readonly string[];
  /** Each verified, filter-matching event once, whichever relay sends it first. */
  onEvent: (event: NostrEvent, relay: string) => void;
  onStatus?: (status: { relay: string; state: SubscriptionState; reason?: string }) => void;
  /** Reconnect delay, with full jitter, doubling per failure. Default 1000. */
  initialBackoffMs?: number;
  /** Default 30000. */
  maxBackoffMs?: number;
}

export interface Subscription {
  /** CLOSE the subscription on every relay and stop reconnecting. */
  stop(): void;
  /** Relays whose subscription is currently open. */
  getHealth(): { connected: number; total: number };
}

/**
 * Keep `filter` subscribed on every relay until `stop()`. Each relay's REQ is
 * re-sent whenever its socket comes back, so a `since` filter backfills what
 * was missed. Events are verified and filter-matched like `queryEvents`, and
 * delivered once per id across all relays.
 *
 * In a browser the subscription rides the page's pooled socket to each relay
 * and holds one of its subscription slots while open.
 */
export function subscribe(filter: Filter, opts: SubscribeOptions): Subscription {
  const relays = opts.relays ?? DEFAULT_RELAYS;
  const initialBackoff = opts.initialBackoffMs ?? 1000;
  const maxBackoff = opts.maxBackoffMs ?? 30_000;
  const subId = "ocns-" + Math.random().toString(36).slice(2, 10);
  const seen = new Set<string>();
  let stopped = false;

  interface Link {
    url: string;
    channel: Channel | null;
    open: boolean;
    sent: boolean;
    backoff: number;
    retry: ReturnType<typeof setTimeout> | null;
  }

  const links: Link[] = relays.map((url) => ({
    url,
    channel: null,
    open: false,
    sent: false,
    backoff: initialBackoff,
    retry: null,
  }));

  const status = (link: Link, state: SubscriptionState, reason?: string) =>
    opts.onStatus?.({ relay: link.url, state, ...(reason ? { reason } : {}) });

  // Full jitter over the current window, so relays that failed together do
  // not all come back at the same instant.
  function later(link: Link): void {
    if (stopped || link.retry) return;
    const wait = Math.random() * link.backoff;
    link.backoff = Math.min(link.backoff * 2, maxBackoff);
    link.retry = setTimeout(() => {
      link.retry = null;
      connect(link);
    }, wait);
  }

  function lost(link: Link, state: SubscriptionState, reason?: string): void {
    const channel = link.channel;
    link.channel = null;
    link.open = false;
    link.sent = false;
    channel?.end();
    status(link, state, reason);
    later(link);
  }

  function connect(link: Link): void {
    if (stopped) return;
    const channel = openChannel(
      link.url,
      {
        open: () => {
          if (link.channel !== channel) return;
          link.open = true;
          link.sent = true;
          link.backoff = initialBackoff;
          channel?.send(["REQ", subId, filter]);
          status(link, "open");
        },
        frame: (frame) => {
          if (link.channel !== channel || frame.payload[0] !== subId) return;
          if (frame.type === "EVENT") {
            const event = frame.payload[1];
            if (!verifyEvent(event) || !matchFilter(event, filter)) return;
            if (seen.has(event.id)) return;
            seen.add(event.id);
            opts.onEvent(event, link.url);
          } else if (frame.type === "EOSE") {
            status(link, "eose");
          } else if (frame.type === "CLOSED") {
            // The relay ended it; ask again after the back-off.
            link.sent = false;
            lost(link, "closed", String(frame.payload[1] ?? "closed"));
          }
        },
        down: (kind, detail) => {
          if (link.channel !== channel) return;
          lost(link, kind === "error" ? "error" : "closed", detail);
        },
      },
      { subscription: true },
    );
    link.channel = channel;
    if (!channel) {
      status(link, "unavailable", "relay_unavailable");
      later(link);
    }
  }

  for (const link of links) connect(link);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const link of links) {
        if (link.retry) clearTimeout(link.retry);
        link.retry = null;
        if (link.sent) link.channel?.send(["CLOSE", subId]);
        link.channel?.end();
        link.channel = null;
        link.open = false;
      }
    },
    getHealth() {
      return { connected: links.filter((l) => l.open).length, total: links.length };
    },
  };
}
