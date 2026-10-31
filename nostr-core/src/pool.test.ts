/**
 * Pooled transport: one socket per relay per page.
 *
 * Every test in the first two blocks fails with pooling off
 * (`NOSTR_CORE_POOL_OFF=1 vitest run src/pool.test.ts`): each one asserts
 * something only a shared socket does, such as one connection for many calls,
 * a subscription cap, or a back-off that stops re-dialling a relay that
 * refused. The redial block's first test fails with the redial off
 * (`NOSTR_CORE_REDIAL_OFF=1`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  closeRelayPool,
  configureRelayPool,
  getEventHash,
  publishEvent,
  queryEvents,
  subscribe,
  type NostrEvent,
  type QueryResult,
  type SubscriptionState,
} from "./index";

const SK = new Uint8Array(32).fill(7);

function signed(content: string): NostrEvent {
  const base = {
    kind: 30078,
    created_at: 1735689600,
    content,
    tags: [["d", `oc-test:${content}`]],
    pubkey: bytesToHex(schnorr.getPublicKey(SK)),
  };
  const id = getEventHash(base);
  return { ...base, id, sig: bytesToHex(schnorr.sign(id, SK)) };
}

const EV = signed("one");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// ── A fake relay per URL: counts connections and subscriptions ────────────

interface Relay {
  events: NostrEvent[];
  refuse: boolean;
  /** Refuse this many handshakes first, then accept. */
  refuseFirst: number;
  hold: boolean; // keep subscriptions open until release()
  okReversed: boolean;
  connections: number;
  reqs: string[];
  closes: string[];
  open: Set<string>;
  maxOpen: number;
  sockets: FakeSocket[];
}

const relays = new Map<string, Relay>();

function relay(url: string, cfg: Partial<Relay> = {}): Relay {
  const r: Relay = {
    events: [EV],
    refuse: false,
    refuseFirst: 0,
    hold: false,
    okReversed: false,
    connections: 0,
    reqs: [],
    closes: [],
    open: new Set(),
    maxOpen: 0,
    sockets: [],
    ...cfg,
  };
  relays.set(url, r);
  return r;
}

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  private pendingOk: string[] = [];
  private readonly r: Relay;

  constructor(readonly url: string) {
    this.r = relays.get(url)!;
    this.r.connections++;
    this.r.sockets.push(this);
    queueMicrotask(() => {
      if (this.r.refuse || this.r.connections <= this.r.refuseFirst) {
        // A 503 or 429 at the handshake: error, then close, never open.
        this.onerror?.({});
        this.onclose?.();
      } else {
        this.onopen?.();
      }
    });
  }

  private emit(frame: unknown[]) {
    if (!this.closed) this.onmessage?.({ data: JSON.stringify(frame) });
  }

  answer(subId: string) {
    for (const ev of this.r.events) this.emit(["EVENT", subId, ev]);
    this.emit(["EOSE", subId]);
  }

  send(raw: string) {
    const frame = JSON.parse(raw) as unknown[];
    if (frame[0] === "REQ") {
      const subId = frame[1] as string;
      this.r.reqs.push(subId);
      this.r.open.add(subId);
      this.r.maxOpen = Math.max(this.r.maxOpen, this.r.open.size);
      if (!this.r.hold) queueMicrotask(() => this.answer(subId));
    } else if (frame[0] === "CLOSE") {
      this.r.closes.push(frame[1] as string);
      this.r.open.delete(frame[1] as string);
    } else if (frame[0] === "EVENT") {
      const id = (frame[1] as NostrEvent).id;
      this.pendingOk.push(id);
      // Answer once every publish in this turn has arrived, in reverse order
      // when asked, so a match by event id is what decides each result.
      queueMicrotask(() =>
        queueMicrotask(() => {
          const ids = this.r.okReversed ? [...this.pendingOk].reverse() : this.pendingOk;
          this.pendingOk = [];
          for (const i of ids) this.emit(["OK", i, true, `stored ${i.slice(0, 8)}`]);
        }),
      );
    }
  }

  close() {
    this.closed = true;
  }

  /** The relay drops the connection. */
  drop() {
    this.closed = true;
    this.onclose?.();
  }
}

function release(url: string) {
  const r = relays.get(url)!;
  for (const s of r.sockets) for (const sub of [...r.open]) s.answer(sub);
}

const ENABLED = process.env.NOSTR_CORE_POOL_OFF !== "1";

beforeEach(() => {
  relays.clear();
  vi.stubGlobal("WebSocket", FakeSocket);
  configureRelayPool({
    enabled: ENABLED,
    maxSubscriptions: 10,
    // Off for the blocks that test the back-off itself; the redial block turns it on.
    redialMs: 0,
    backoffMs: 10_000,
    idleMs: 30_000,
  });
});

afterEach(() => {
  // Real timers first, so a throw in closeRelayPool() can't leave fake ones on.
  vi.useRealTimers();
  closeRelayPool();
  vi.unstubAllGlobals();
});

describe("pooled relay sockets", () => {
  it("concurrent queries to one relay share one socket", async () => {
    const r = relay("wss://r");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => queryEvents({ kinds: [30078] }, ["wss://r"], 1000)),
    );
    expect(r.connections).toBe(1);
    expect(r.reqs).toHaveLength(5);
    for (const res of results) {
      expect(res.events.map((e) => e.id)).toEqual([EV.id]);
      expect(res.relayStatus[0]!.eose).toBe(true);
    }
  });

  it("closes each subscription at EOSE and keeps the socket for the next call", async () => {
    const r = relay("wss://r");
    const a = await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    const b = await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    expect(r.connections).toBe(1);
    expect(r.closes).toEqual(r.reqs);
    expect(r.open.size).toBe(0);
    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(1);
  });

  it("holds at most maxSubscriptions open at once and queues the rest", async () => {
    const r = relay("wss://r", { hold: true });
    const all = Promise.all(
      Array.from({ length: 15 }, () => queryEvents({ kinds: [30078] }, ["wss://r"], 2000)),
    );
    await tick(20);
    expect(r.open.size).toBe(10);
    expect(r.reqs).toHaveLength(10);
    release("wss://r"); // the first ten finish; the queued five go out
    await tick(20);
    expect(r.reqs).toHaveLength(15);
    release("wss://r");
    const results = await all;
    expect(results.every((res) => res.relayStatus[0]!.eose)).toBe(true);
    expect(r.maxOpen).toBe(10);
    expect(r.connections).toBe(1);
  });

  it("counts time waiting in the queue against the call's deadline", async () => {
    const r = relay("wss://r", { hold: true });
    const ten = Promise.all(
      Array.from({ length: 10 }, () => queryEvents({ kinds: [30078] }, ["wss://r"], 2000)),
    );
    const start = Date.now();
    const queued = await queryEvents({ kinds: [30078] }, ["wss://r"], 100);
    // It timed out at its own deadline while waiting for a slot, and sent nothing.
    expect(Date.now() - start).toBeLessThan(300);
    expect(queued.relayStatus[0]).toMatchObject({ ok: false, eose: false, reason: "timeout" });
    expect(r.reqs).toHaveLength(10);
    release("wss://r");
    await ten;
  });

  it("a refused handshake settles every waiting call and backs the relay off", async () => {
    const r = relay("wss://busy", { refuse: true });
    configureRelayPool({ backoffMs: 50 });
    const first = await Promise.all(
      Array.from({ length: 3 }, () => queryEvents({ kinds: [30078] }, ["wss://busy"], 1000)),
    );
    expect(first.map((res) => res.relayStatus[0]!.reason)).toEqual([
      "ws_error",
      "ws_error",
      "ws_error",
    ]);
    expect(r.connections).toBe(1);

    // Inside the back-off the relay is skipped, visibly, without dialling.
    const skipped = await queryEvents({ kinds: [30078] }, ["wss://busy"], 1000);
    expect(skipped.relayStatus[0]).toMatchObject({ ok: false, eose: false, reason: "relay_unavailable" });
    const pub = await publishEvent(EV, ["wss://busy"], 1000);
    expect(pub[0]).toMatchObject({ ok: false, reason: "relay_unavailable", attempts: 1 });
    expect(r.connections).toBe(1);

    // After it, the relay is dialled again.
    await tick(60);
    r.refuse = false;
    const again = await queryEvents({ kinds: [30078] }, ["wss://busy"], 1000);
    expect(again.relayStatus[0]!.eose).toBe(true);
    expect(r.connections).toBe(2);
  });

  it("publishes share the socket and match each OK by event id", async () => {
    const r = relay("wss://r", { okReversed: true });
    const evs = [signed("a"), signed("b"), signed("c")];
    const results = await Promise.all(evs.map((e) => publishEvent(e, ["wss://r"], 1000)));
    expect(r.connections).toBe(1);
    results.forEach((res, i) => {
      expect(res[0]).toMatchObject({ ok: true, attempts: 1, reason: `stored ${evs[i]!.id.slice(0, 8)}` });
    });
  });

  it("gives a call with an AUTH signer its own socket", async () => {
    const r = relay("wss://r");
    const signer = () => signed("auth");
    await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    await queryEvents({ kinds: [30078] }, ["wss://r"], 1000, signer);
    await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    // The pooled socket served the first and third; the signed call had its own.
    expect(r.connections).toBe(2);
  });

  it("settles calls on a dropped socket and redials for the next one", async () => {
    const r = relay("wss://r", { hold: true });
    const pending = Promise.all([
      queryEvents({ kinds: [30078] }, ["wss://r"], 2000),
      queryEvents({ kinds: [30078] }, ["wss://r"], 2000),
    ]);
    await tick(10);
    expect(r.connections).toBe(1);
    r.sockets[0]!.drop();
    const dropped = await pending;
    expect(dropped.map((res) => res.relayStatus[0]!.reason)).toEqual(["closed_early", "closed_early"]);
    r.hold = false;
    const next = await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    expect(next.relayStatus[0]!.eose).toBe(true);
    expect(r.connections).toBe(2);
  });

  it("keeps an idle socket open for idleMs, then closes it", async () => {
    const r = relay("wss://r");
    configureRelayPool({ idleMs: 40 });
    await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    expect(r.sockets[0]!.closed).toBe(false);
    await tick(70);
    expect(r.sockets[0]!.closed).toBe(true);
    await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    expect(r.connections).toBe(2);
  });
});

describe("pooled subscribe()", () => {
  it("rides the same socket as the page's queries", async () => {
    const r = relay("wss://r");
    const got: string[] = [];
    const sub = subscribe({ kinds: [30078] }, { relays: ["wss://r"], onEvent: (e) => got.push(e.id) });
    await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    await tick(10);
    expect(r.connections).toBe(1);
    expect(got).toEqual([EV.id]);
    expect(sub.getHealth()).toEqual({ connected: 1, total: 1 });
    sub.stop();
  });

  it("re-sends its REQ on the new socket after a drop", async () => {
    const r = relay("wss://r", { hold: true });
    const states: SubscriptionState[] = [];
    const sub = subscribe(
      { kinds: [30078] },
      { relays: ["wss://r"], onEvent: () => {}, onStatus: (s) => states.push(s.state), initialBackoffMs: 5 },
    );
    const pending = queryEvents({ kinds: [30078] }, ["wss://r"], 2000);
    await tick(10);
    expect(r.connections).toBe(1); // the subscription and the query share it
    r.hold = false;
    r.sockets[0]!.drop();
    await pending;
    await tick(40);
    expect(r.connections).toBe(2);
    expect(r.reqs.length).toBeGreaterThanOrEqual(3); // sub, query, sub again
    expect(states).toEqual(expect.arrayContaining(["open", "closed"]));
    expect(states.filter((s) => s === "open")).toHaveLength(2);
    sub.stop();
  });

  it("holds a subscription slot until stop(), which sends CLOSE and frees it", async () => {
    const r = relay("wss://r", { hold: true });
    configureRelayPool({ maxSubscriptions: 1 });
    const sub = subscribe({ kinds: [30078] }, { relays: ["wss://r"], onEvent: () => {} });
    await tick(10);
    r.hold = false;
    const queued = queryEvents({ kinds: [30078] }, ["wss://r"], 2000);
    await tick(20);
    expect(r.reqs).toHaveLength(1); // the query waits for the slot
    const subReq = r.reqs[0]!;
    sub.stop();
    const res = await queued;
    expect(r.closes).toContain(subReq);
    expect(res.relayStatus[0]!.eose).toBe(true);
  });

  it("reports a backing-off relay as unavailable without dialling it", async () => {
    const r = relay("wss://busy", { refuse: true });
    const states: SubscriptionState[] = [];
    const sub = subscribe(
      { kinds: [30078] },
      { relays: ["wss://busy"], onEvent: () => {}, onStatus: (s) => states.push(s.state), initialBackoffMs: 5, maxBackoffMs: 5 },
    );
    await tick(60);
    sub.stop();
    expect(states[0]).toBe("error");
    expect(states).toContain("unavailable");
    expect(r.connections).toBe(1);
  });
});

describe("one bounded redial after a refused handshake", () => {
  const REDIAL = process.env.NOSTR_CORE_REDIAL_OFF === "1" ? 0 : 50;

  it("dials once more and answers when the deadline has room", async () => {
    // A relay that refuses one handshake (damus's occasional 503), then accepts.
    const r = relay("wss://r", { refuseFirst: 1 });
    configureRelayPool({ redialMs: REDIAL });
    const res = await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    expect(res.relayStatus[0]!.eose).toBe(true);
    expect(res.events.map((e) => e.id)).toEqual([EV.id]);
    expect(r.connections).toBe(2);
  });

  it("never redials when the earliest waiting call would expire first", async () => {
    // Fake timers, not a wall-clock bound of 40 ms, which a loaded runner can
    // pass. The fake socket refuses on a microtask, which stays real.
    vi.useFakeTimers();
    const r = relay("wss://r", { refuseFirst: 1 });
    configureRelayPool({ redialMs: 50 });
    let results: QueryResult[] | undefined;
    void Promise.all([
      queryEvents({ kinds: [30078] }, ["wss://r"], 40), // shorter than the redial
      queryEvents({ kinds: [30078] }, ["wss://r"], 1000),
    ]).then((rs) => (results = rs));
    // Both settle on the refusal itself, before any timer could fire.
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toBeDefined();
    const [short, long] = results!;
    expect(r.connections).toBe(1);
    expect(short!.relayStatus[0]!.reason).toBe("ws_error");
    expect(long!.relayStatus[0]!.reason).toBe("ws_error");
    // And the relay is backing off, not redialled later.
    await vi.advanceTimersByTimeAsync(80);
    expect(r.connections).toBe(1);
  });

  it("redials at most once, then backs off", async () => {
    const r = relay("wss://r", { refuse: true });
    configureRelayPool({ redialMs: 20 });
    const res = await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    expect(res.relayStatus[0]!.reason).toBe("ws_error");
    expect(r.connections).toBe(2);
    const skipped = await queryEvents({ kinds: [30078] }, ["wss://r"], 1000);
    expect(skipped.relayStatus[0]!.reason).toBe("relay_unavailable");
    expect(r.connections).toBe(2);
  });
});

