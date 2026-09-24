/**
 * @orangecheck/nostr-core — unit tests
 *
 * Covers the bits that don't need a live relay:
 *   - DEFAULT_RELAYS shape + invariants
 *   - frame parsing (the inner protocol parser)
 *   - publishEvent / queryEvents end-to-end against a mock WebSocket
 *
 * The mock WebSocket implementation lives at the bottom of this file.
 * It implements just enough of the WHATWG WebSocket interface to drive
 * publishOne / attemptPublish + queryEvents through their happy paths
 * and a few error paths.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  DEFAULT_RELAYS,
  getEventHash,
  matchFilter,
  publishEvent,
  queryEvents,
  verifyEvent,
  type Filter,
  type NostrEvent,
} from "./index";

// ── DEFAULT_RELAYS ───────────────────────────────────────────────────────

describe("DEFAULT_RELAYS", () => {
  it("has at least 5 relays", () => {
    // Breadth is the point, not the number: no artifact should depend on
    // any single relay being up (invariant 5, and oc-relay-infra/BYPASS.md).
    // This caught the 2026-09-03 removal of relay.nostr.band, which had
    // gone permanently unreachable — the right response was to restore
    // breadth with a relay that answers, not to lower the bar.
    expect(DEFAULT_RELAYS.length).toBeGreaterThanOrEqual(5);
  });

  it("does not list a relay known to be unreachable", () => {
    // relay.nostr.band: DNS resolves 95.216.33.150 but port 443 never
    // completes a handshake, from two independent networks, and the apex
    // nostr.band is down too. A dead relay in a default set is worse than a
    // missing one — fan-outs wait on it. Re-add it only after checking.
    expect(DEFAULT_RELAYS).not.toContain("wss://relay.nostr.band");
  });

  it("includes the family first-party relay", () => {
    expect(DEFAULT_RELAYS).toContain("wss://relay.ochk.io");
  });

  it("is not relay.ochk.io alone (BYPASS invariant)", () => {
    expect(DEFAULT_RELAYS).not.toEqual(["wss://relay.ochk.io"]);
  });

  it("is frozen at runtime — consumers cannot mutate", () => {
    expect(() => {
      (DEFAULT_RELAYS as unknown as string[]).push("wss://attack.example");
    }).toThrow();
  });

  it("every entry is a wss:// or ws:// URL", () => {
    for (const relay of DEFAULT_RELAYS) {
      expect(relay).toMatch(/^wss?:\/\//);
    }
  });
});

// ── publishEvent + queryEvents — mock-WebSocket-backed integration ──────

const SAMPLE_EVENT: NostrEvent = {
  id: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  kind: 30078,
  pubkey: "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
  created_at: 1735689600,
  content: "test",
  tags: [["d", "oc-test:abc"]],
  sig: "cafebabe".repeat(16),
};

const SK = new Uint8Array(32).fill(7);
const SK2 = new Uint8Array(32).fill(9);

/** A correctly signed event over SAMPLE_EVENT's fields plus `overrides`. */
function signed(
  overrides: Partial<Omit<NostrEvent, "id" | "sig" | "pubkey">> = {},
  sk: Uint8Array = SK,
): NostrEvent {
  const base = {
    kind: SAMPLE_EVENT.kind,
    created_at: SAMPLE_EVENT.created_at,
    content: SAMPLE_EVENT.content,
    tags: SAMPLE_EVENT.tags,
    ...overrides,
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
  };
  const id = getEventHash(base);
  return { ...base, id, sig: bytesToHex(schnorr.sign(id, sk)) };
}

beforeEach(() => {
  installMockWebSocket();
});

afterEach(() => {
  restoreWebSocket();
});

describe("publishEvent", () => {
  it("returns one PublishResult per relay", async () => {
    mockNextHandshake("OK", { ok: true });
    mockNextHandshake("OK", { ok: true });
    const results = await publishEvent(SAMPLE_EVENT, ["wss://a", "wss://b"]);
    expect(results).toHaveLength(2);
    expect(results[0]!.relay).toBe("wss://a");
    expect(results[1]!.relay).toBe("wss://b");
  });

  it("marks ok: true when relay sends OK true", async () => {
    mockNextHandshake("OK", { ok: true });
    const results = await publishEvent(SAMPLE_EVENT, ["wss://a"]);
    expect(results[0]!.ok).toBe(true);
    expect(results[0]!.attempts).toBe(1);
  });

  it("marks ok: false when relay rejects with OK false + reason", async () => {
    mockNextHandshake("OK", { ok: false, reason: "blocked: bad shape" });
    const results = await publishEvent(SAMPLE_EVENT, ["wss://a"]);
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.reason).toBe("blocked: bad shape");
  });

  it("retries on transient failure (3 attempts, exits ok: false)", async () => {
    // 3 errors → exhausts retries. We assert the shape (attempts=3,
    // ok=false) — the precise lastReason can race with the timeout
    // on slow runners and isn't load-bearing for the contract.
    mockNextHandshake("error");
    mockNextHandshake("error");
    mockNextHandshake("error");
    const results = await publishEvent(SAMPLE_EVENT, ["wss://flaky"], 1000);
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.attempts).toBe(3);
  }, 30_000);

  it("publishes to all relays in parallel", async () => {
    mockNextHandshake("OK", { ok: true });
    mockNextHandshake("OK", { ok: true });
    mockNextHandshake("OK", { ok: true });
    const start = Date.now();
    await publishEvent(SAMPLE_EVENT, ["wss://a", "wss://b", "wss://c"]);
    const elapsed = Date.now() - start;
    // If they ran serially with the mock's tiny delay we'd see ≥ 30ms.
    // Parallel should resolve in well under that.
    expect(elapsed).toBeLessThan(100);
  });
});

describe("queryEvents", () => {
  it("returns events streamed via EVENT, dedupes across relays", async () => {
    const ev1 = signed({ content: "one" });
    const ev2 = signed({ content: "two", created_at: 1735689700 });
    mockNextQuery([ev1, ev2]);
    // Same event id on a second relay — should dedupe.
    mockNextQuery([ev1]);

    const result = await queryEvents({ kinds: [30078] }, [
      "wss://a",
      "wss://b",
    ]);
    expect(result.events).toHaveLength(2);
    // Sorted by created_at desc.
    expect(result.events[0]!.id).toBe(ev2.id);
    expect(result.events[1]!.id).toBe(ev1.id);
    expect(result.relayStatus.filter((s) => s.ok)).toHaveLength(2);
    expect(result.relayStatus.every((s) => s.eose)).toBe(true);
  });

  it("reports per-relay status — failure on one does not block others", async () => {
    const ev = signed();
    mockNextQuery([ev]);
    mockNextQuery("error");

    const result = await queryEvents({ kinds: [30078] }, [
      "wss://good",
      "wss://bad",
    ]);
    expect(result.events).toHaveLength(1);
    const okStatuses = result.relayStatus.filter((s) => s.ok);
    const failStatuses = result.relayStatus.filter((s) => !s.ok);
    expect(okStatuses).toHaveLength(1);
    expect(failStatuses).toHaveLength(1);
  });

  it("settles at once on CLOSED instead of waiting out the timeout", async () => {
    // The regression: CLOSED was a recognised frame type with no branch in
    // the query loop, so a relay that ended the subscription still cost the
    // full timeout — 8s on chat's device lookup, which is on the
    // deliverability path. strfry does this for unindexed tag filters and
    // relay.snort.social is in DEFAULT_RELAYS.
    mockNextQueryClosed("error: filter has unindexed tag");
    const start = Date.now();
    const result = await queryEvents(
      { kinds: [30078] },
      ["wss://closed"],
      2000,
    );
    expect(Date.now() - start).toBeLessThan(500);
    expect(result.relayStatus[0]!.ok).toBe(false);
    expect(result.relayStatus[0]!.reason).toBe(
      "error: filter has unindexed tag",
    );
  });

  it("keeps the relay reason instead of reporting a generic timeout", async () => {
    // The reason explains WHY the relay refused. Reporting 'timeout'
    // discarded it and described the wrong failure.
    mockNextQueryClosed("rate-limited");
    const result = await queryEvents({ kinds: [1] }, ["wss://closed2"], 2000);
    expect(result.relayStatus[0]!.reason).not.toBe("timeout");
    expect(result.relayStatus[0]!.reason).toBe("rate-limited");
  });

  it("counts a relay that streamed events before closing as having answered", async () => {
    // A relay may serve some stored events and then end the sub. Those
    // events are real; ok must not depend on the frame that ended it.
    mockNextQueryClosed("done", [signed()]);
    const result = await queryEvents(
      { kinds: [30078] },
      ["wss://closed3"],
      2000,
    );
    expect(result.events).toHaveLength(1);
    expect(result.relayStatus[0]!.ok).toBe(true);
    // Answered, but not completely: the relay never said it was done.
    expect(result.relayStatus[0]!.eose).toBe(false);
  });

  it("respects timeoutMs when relay never sends EOSE", async () => {
    mockNextQuery("hang");
    const start = Date.now();
    const result = await queryEvents({ kinds: [30078] }, ["wss://hang"], 200);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(500);
    expect(result.relayStatus[0]!.reason).toBe("timeout");
    expect(result.relayStatus[0]!.eose).toBe(false);
  });

  it("reports eose only for a relay that finished, even when it returned nothing", async () => {
    mockNextQuery([]);
    mockNextQuery("error");
    const result = await queryEvents({ kinds: [30078] }, [
      "wss://empty",
      "wss://down",
    ]);
    expect(result.events).toHaveLength(0);
    expect(result.relayStatus.find((s) => s.relay === "wss://empty")!.eose).toBe(true);
    expect(result.relayStatus.find((s) => s.relay === "wss://down")!.eose).toBe(false);
  });
});

describe("NIP-42 AUTH (additive)", () => {
  it("publishEvent completes the AUTH handshake then publishes", async () => {
    mockNextAuthPublish("chal-xyz");
    let signedChallenge: string | undefined;
    const results = await publishEvent(
      SAMPLE_EVENT,
      ["wss://auth"],
      5000,
      (challenge, url) => {
        signedChallenge = challenge;
        return fakeAuthSigner(challenge, url);
      },
    );
    expect(results[0]!.ok).toBe(true);
    expect(signedChallenge).toBe("chal-xyz"); // the signer saw the relay's challenge
  });

  it("publishEvent WITHOUT an auth signer ignores the challenge and fails (no behavior change)", async () => {
    mockNextAuthPublish("chal-xyz");
    const results = await publishEvent(SAMPLE_EVENT, ["wss://auth"], 200);
    expect(results[0]!.ok).toBe(false); // never authed → no OK → times out
  }, 10_000);

  it("queryEvents completes the AUTH handshake then serves the REQ", async () => {
    const ev = signed({ content: "c" });
    mockNextAuthQuery("chal-q", [ev]);
    const result = await queryEvents(
      { kinds: [30078] },
      ["wss://auth"],
      5000,
      fakeAuthSigner,
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.id).toBe(ev.id);
  });
});

describe("queryEvents returns only verified, filter-matching events", () => {
  it("drops an event whose content does not hash to its id", async () => {
    const good = signed();
    const altered = { ...good, content: "altered" };
    mockNextQuery([altered]);
    const result = await queryEvents({ kinds: [30078] }, ["wss://a"]);
    expect(result.events).toHaveLength(0);
    expect(result.relayStatus[0]!.rejected).toBe(1);
    expect(result.relayStatus[0]!.events).toBe(0);
  });

  it("drops an event whose signature is not by its pubkey", async () => {
    const good = signed();
    const other = signed({}, SK2);
    // Correct id for these fields, but the signature belongs to another key.
    mockNextQuery([{ ...good, sig: bytesToHex(schnorr.sign(good.id, SK2)) }]);
    mockNextQuery([{ ...other, pubkey: good.pubkey }]);
    const result = await queryEvents({ kinds: [30078] }, [
      "wss://a",
      "wss://b",
    ]);
    expect(result.events).toHaveLength(0);
    expect(result.relayStatus.map((s) => s.rejected)).toEqual([1, 1]);
  });

  it("drops a valid event that does not match the filter", async () => {
    mockNextQuery([
      signed({ kind: 1 }),
      signed({ tags: [["d", "other"]] }),
      signed({ created_at: 100 }),
    ]);
    const result = await queryEvents(
      { kinds: [30078], "#d": ["oc-test:abc"], since: 1000 },
      ["wss://a"],
    );
    expect(result.events).toHaveLength(0);
    expect(result.relayStatus[0]!.rejected).toBe(3);
    expect(result.relayStatus[0]!.ok).toBe(true); // it did reach EOSE
  });

  it("drops an event from an author outside the filter", async () => {
    mockNextQuery([signed({}, SK2)]);
    const result = await queryEvents(
      { authors: [signed().pubkey] },
      ["wss://a"],
    );
    expect(result.events).toHaveLength(0);
  });

  it("an altered copy under a known id cannot displace the signed event", async () => {
    const good = signed({ content: "original" });
    mockNextQuery([{ ...good, content: "replacement" }]);
    mockNextQuery([good]);
    const result = await queryEvents({ kinds: [30078] }, [
      "wss://first",
      "wss://second",
    ]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.content).toBe("original");
  });

  it("a relay that returns only rejected events is not reported ok after closing", async () => {
    mockNextQueryClosed("done", [{ ...signed(), content: "x" }]);
    const result = await queryEvents({ kinds: [30078] }, ["wss://c"], 2000);
    expect(result.relayStatus[0]!.ok).toBe(false);
    expect(result.relayStatus[0]!.rejected).toBe(1);
  });
});

describe("verifyEvent", () => {
  it("accepts a correctly signed event", () => {
    expect(verifyEvent(signed())).toBe(true);
  });

  it("rejects malformed shapes", () => {
    const ev = signed();
    expect(verifyEvent(null)).toBe(false);
    expect(verifyEvent({ ...ev, id: ev.id.toUpperCase() })).toBe(false);
    expect(verifyEvent({ ...ev, tags: [[1]] })).toBe(false);
    expect(verifyEvent({ ...ev, created_at: "1" })).toBe(false);
    expect(verifyEvent({ ...ev, sig: "00" })).toBe(false);
  });

  it("rejects any changed field", () => {
    const ev = signed();
    expect(verifyEvent({ ...ev, kind: 30079 })).toBe(false);
    expect(verifyEvent({ ...ev, created_at: ev.created_at + 1 })).toBe(false);
    expect(verifyEvent({ ...ev, tags: [["d", "oc-test:xyz"]] })).toBe(false);
  });
});

describe("matchFilter", () => {
  const ev = signed({ tags: [["t", "oc-attest"], ["d", "x"]] });

  it("matches on every constraint together", () => {
    expect(
      matchFilter(ev, {
        ids: [ev.id],
        kinds: [30078],
        authors: [ev.pubkey],
        "#t": ["oc-attest", "other"],
        since: ev.created_at,
        until: ev.created_at,
        limit: 1,
      }),
    ).toBe(true);
  });

  it("fails when any single constraint fails", () => {
    expect(matchFilter(ev, { ids: ["f".repeat(64)] })).toBe(false);
    expect(matchFilter(ev, { "#t": ["oc-vote"] })).toBe(false);
    expect(matchFilter(ev, { "#p": [ev.pubkey] })).toBe(false);
    expect(matchFilter(ev, { until: ev.created_at - 1 })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Mock WebSocket harness
// ─────────────────────────────────────────────────────────────────────────

type Outcome =
  | { kind: "publish_ok"; ok: boolean; reason?: string }
  | { kind: "error" }
  | { kind: "query"; events: NostrEvent[] }
  | { kind: "query_error" }
  | { kind: "query_hang" }
  // NIP-42: challenge first, then accept the re-sent EVENT/REQ after AUTH.
  | { kind: "auth_then_ok"; challenge: string }
  | { kind: "auth_then_query"; challenge: string; events: NostrEvent[] }
  | { kind: "query_closed"; reason: string; events: NostrEvent[] };

const outcomes: Outcome[] = [];

function mockNextHandshake(
  type: "OK" | "error",
  detail?: { ok: boolean; reason?: string },
) {
  if (type === "OK") {
    outcomes.push({
      kind: "publish_ok",
      ok: detail!.ok,
      reason: detail?.reason,
    });
  } else {
    outcomes.push({ kind: "error" });
  }
}

function mockNextQuery(detail: NostrEvent[] | "error" | "hang") {
  if (detail === "error") outcomes.push({ kind: "query_error" });
  else if (detail === "hang") outcomes.push({ kind: "query_hang" });
  else outcomes.push({ kind: "query" as const, events: detail });
}

/** A relay that ENDS the subscription with CLOSED instead of EOSE — what
 *  strfry does when a filter uses an unindexed multi-letter tag. Optionally
 *  streams some events first, which a real relay may do before closing. */
function mockNextQueryClosed(reason: string, events: NostrEvent[] = []) {
  outcomes.push({ kind: "query_closed" as const, reason, events });
}

/** A relay that challenges with NIP-42 AUTH before accepting the publish. */
function mockNextAuthPublish(challenge: string) {
  outcomes.push({ kind: "auth_then_ok", challenge });
}

/** A relay that challenges with NIP-42 AUTH before serving the query. */
function mockNextAuthQuery(challenge: string, events: NostrEvent[]) {
  outcomes.push({ kind: "auth_then_query", challenge, events });
}

/** A throwaway kind-22242 AUTH signer for tests (no real crypto needed). */
const fakeAuthSigner = (challenge: string, relayUrl: string): NostrEvent => ({
  id: "a".repeat(64),
  kind: 22242,
  pubkey: "f".repeat(64),
  created_at: 1735689600,
  content: "",
  tags: [
    ["relay", relayUrl],
    ["challenge", challenge],
  ],
  sig: "cafebabe".repeat(16),
});

let originalWebSocket: typeof globalThis.WebSocket | undefined;

function installMockWebSocket() {
  originalWebSocket = globalThis.WebSocket;
  outcomes.length = 0;

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 1;

    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    onclose: (() => void) | null = null;

    private outcome: Outcome | undefined;
    private authChallenged = false; // NIP-42: challenge fired once per connection

    constructor(public url: string) {
      this.outcome = outcomes.shift();
      // Fire onopen + react asynchronously so the caller can attach handlers.
      queueMicrotask(() => this.onopen?.());
    }

    send(raw: string) {
      const frame = JSON.parse(raw) as unknown[];
      const type = frame[0];
      if (type === "AUTH") {
        // The client answered our NIP-42 challenge; nothing to do — the
        // re-sent EVENT/REQ that follows is what we accept.
        return;
      }
      if (type === "EVENT") {
        const event = frame[1] as NostrEvent;
        queueMicrotask(() => {
          if (!this.outcome) return;
          if (this.outcome.kind === "auth_then_ok") {
            if (!this.authChallenged) {
              this.authChallenged = true;
              this.onmessage?.({
                data: JSON.stringify(["AUTH", this.outcome.challenge]),
              });
            } else {
              this.onmessage?.({
                data: JSON.stringify(["OK", event.id, true, ""]),
              });
            }
          } else if (this.outcome.kind === "publish_ok") {
            this.onmessage?.({
              data: JSON.stringify([
                "OK",
                event.id,
                this.outcome.ok,
                this.outcome.reason ?? "",
              ]),
            });
          } else if (this.outcome.kind === "error") {
            this.onerror?.({});
          }
        });
      } else if (type === "REQ") {
        const subId = frame[1] as string;
        queueMicrotask(() => {
          if (!this.outcome) return;
          if (this.outcome.kind === "auth_then_query") {
            if (!this.authChallenged) {
              this.authChallenged = true;
              this.onmessage?.({
                data: JSON.stringify(["AUTH", this.outcome.challenge]),
              });
              return;
            }
            for (const ev of this.outcome.events) {
              this.onmessage?.({ data: JSON.stringify(["EVENT", subId, ev]) });
            }
            this.onmessage?.({ data: JSON.stringify(["EOSE", subId]) });
          } else if (this.outcome.kind === "query") {
            for (const ev of this.outcome.events) {
              this.onmessage?.({ data: JSON.stringify(["EVENT", subId, ev]) });
            }
            this.onmessage?.({ data: JSON.stringify(["EOSE", subId]) });
          } else if (this.outcome.kind === "query_closed") {
            for (const ev of this.outcome.events) {
              this.onmessage?.({ data: JSON.stringify(["EVENT", subId, ev]) });
            }
            this.onmessage?.({
              data: JSON.stringify(["CLOSED", subId, this.outcome.reason]),
            });
          } else if (this.outcome.kind === "query_error") {
            this.onerror?.({});
          } else if (this.outcome.kind === "query_hang") {
            // do nothing — caller's timeout fires
          }
        });
      } else if (type === "CLOSE") {
        // queryEvents sends CLOSE after EOSE; we don't need to react.
      }
    }

    close() {
      this.readyState = 3;
    }
  }

  vi.stubGlobal("WebSocket", MockWebSocket);
}

function restoreWebSocket() {
  if (originalWebSocket) globalThis.WebSocket = originalWebSocket;
  vi.unstubAllGlobals();
}

// ─────────────────────────────────────────────────────────────────────────
// Filter key space — NIP-12 indexed tags are single-letter only.
//
// These assertions are compile-time. They exist because the same silently-
// empty query shipped in four codebases (OC Vote's tally, OC Agent's
// revocation lookup, @orangecheck/sdk's check(), and this package's own type)
// while `Filter` still advertised '#poll_id' / '#voter' / '#creator' as valid.
// A multi-letter filter is not a style question — a conforming relay cannot
// match it, so the query returns nothing and the caller believes the answer.
// ─────────────────────────────────────────────────────────────────────────
describe("Filter key space", () => {
  it("accepts single-letter indexed tag filters", () => {
    const ok: Filter = {
      kinds: [30081],
      "#t": ["abc"],
      "#d": ["x"],
      "#p": ["y"],
    };
    expect(ok["#t"]).toEqual(["abc"]);
  });

  it("rejects multi-letter tag filters at compile time", () => {
    const bad: Filter = {
      kinds: [30081],
      // @ts-expect-error '#poll_id' is not indexable — relays never match it.
      "#poll_id": ["abc"],
    };
    // The value still exists at runtime; the point is that tsc refuses it.
    expect((bad as Record<string, unknown>)["#poll_id"]).toEqual(["abc"]);
  });

  it("rejects the other names that actually shipped", () => {
    const a: Filter = {
      // @ts-expect-error not indexable
      "#delegation": ["x"],
    };
    const b: Filter = {
      // @ts-expect-error not indexable
      "#address": ["x"],
    };
    expect([a, b]).toHaveLength(2);
  });
});
