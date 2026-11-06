/**
 * readPages and readRelays: a read paged to its end on every relay, whatever
 * page size each one caps at; relayMaxLimit, the page size a relay declares.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MIN_PAGE,
  matchFilter,
  readPages,
  readRelays,
  relayMaxLimit,
  type Filter,
  type NostrEvent,
  type PageAnswer,
  type PagedRead,
} from "./index";

const TAG = "c".repeat(64);
const OTHER_TAG = "d".repeat(64);
const FILTER: Filter = { kinds: [30110], "#t": [TAG] };

let made = 0;
/** `n` events under `tag`, the i-th at `at(i)`, each id new. */
const events = (n: number, at: (i: number) => number, tag = TAG): NostrEvent[] =>
  Array.from({ length: n }, (_, i) => ({
    id: (made++).toString(16).padStart(64, "0"),
    pubkey: "ab".repeat(32),
    sig: "0".repeat(128),
    kind: 30110,
    created_at: at(i),
    content: "",
    tags: [["t", tag]],
  }));
const one = (at: number) => events(1, () => at)[0]!;

/** A relay: what it holds, the most it sends a page, events the reader drops it puts in
 *  a page, whether it answers a REQ, and a state a reader that paged it reports. */
interface Relay {
  relay: string;
  held: readonly NostrEvent[];
  cap?: number;
  pad?: (f: Filter) => number;
  answers?: (f: Filter) => boolean;
  state?: PageAnswer["state"];
}

/** Relays as queryEvents asks them: newest first, `since` and `until` inclusive, the
 *  lesser of `limit` and the relay's cap; per relay what it sent, kept and dropped. */
function relays(set: readonly Relay[], calls: Filter[] = []) {
  return async (f: Filter) => {
    calls.push(f);
    const byId = new Map<string, NostrEvent>();
    const relayStatus = set.map((r): PageAnswer => {
      if (r.answers && !r.answers(f)) return { relay: r.relay, eose: false, events: 0, rejected: 0 };
      if (r.state) return { relay: r.relay, eose: r.state === "complete", state: r.state };
      const room = Math.min(f.limit ?? Infinity, r.cap ?? Infinity);
      const pad = Math.min(r.pad?.(f) ?? 0, room);
      const page = r.held
        .filter((e) => matchFilter(e, f))
        .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))
        .slice(0, room - pad);
      for (const e of page) byId.set(e.id, e);
      return { relay: r.relay, eose: true, events: page.length, rejected: pad };
    });
    return { events: [...byId.values()], relayStatus };
  };
}

const states = (r: Pick<PagedRead, "relayStatus">) => r.relayStatus?.map((s) => s.state);
const ids = (r: { events: NostrEvent[] }) => new Set(r.events.map((e) => e.id));
const FOUR = ["a", "b", "c", "d"];

describe("readPages: a relay that caps a page below the page asked is read past its cap", () => {
  it("one relay capping at 300 and holding 1,000: every event read, complete", async () => {
    const held = events(1000, (i) => 1000 + i);
    const r = await readPages(relays([{ relay: "a", held, cap: 300 }]), FILTER);
    expect(r.events).toHaveLength(1000);
    expect(states(r)).toEqual(["complete"]);
    expect(r.truncated).toBe(false);
    // 300, 300, 300, then 103: shorter than a page it sent, so the end.
    expect(r.pages).toBe(4);
  });

  it("a relay holding exactly its cap reads complete on the page after it", async () => {
    const r = await readPages(relays([{ relay: "a", held: events(300, (i) => 1000 + i), cap: 300 }]), FILTER);
    expect(r.events).toHaveLength(300);
    expect(states(r)).toEqual(["complete"]);
    expect(r.pages).toBe(2);
  });

  it("four relays capping at 300, 300 newer events above the one sought: it is read, and every relay complete", async () => {
    const sought = one(500);
    const held = [sought, ...events(300, (i) => 2000 + i)];
    const r = await readPages(relays(FOUR.map((relay) => ({ relay, held, cap: 300 }))), FILTER);
    expect(ids(r).has(sought.id)).toBe(true);
    expect(states(r)).toEqual(["complete", "complete", "complete", "complete"]);
  });

  it("a relay's events behind its cap are read though another relay's page reaches far below them", async () => {
    // a sends its 300 newest, above the one sought; b sends 499 older than it.
    const sought = one(1000);
    const set = [
      { relay: "a", held: [sought, ...events(300, (i) => 2000 + i)], cap: 300 },
      { relay: "b", held: events(499, (i) => 500 + i), cap: 500 },
    ];
    const r = await readPages(relays(set), FILTER);
    expect(ids(r).has(sought.id)).toBe(true);
    expect(states(r)).toEqual(["complete", "complete"]);
    expect(r.truncated).toBe(false);
  });

  it("relays that each hold their own part are each read to the end of it", async () => {
    const all = events(600, (i) => 1000 + i);
    const set = FOUR.map((relay, n) => ({ relay, held: all.filter((_, i) => i % 4 === n), cap: 100 }));
    const r = await readPages(relays(set), FILTER);
    expect(r.events).toHaveLength(600);
    expect(states(r)).toEqual(["complete", "complete", "complete", "complete"]);
  });

  it("past what the page bound reads of parts that far apart, each relay is cut off, never complete", async () => {
    const all = events(1200, (i) => 1000 + i);
    const set = FOUR.map((relay, n) => ({ relay, held: all.filter((_, i) => i % 4 === n), cap: 100 }));
    const r = await readPages(relays(set), FILTER);
    expect(r.events.length).toBeLessThan(1200);
    expect(states(r)).toEqual(["cut_off", "cut_off", "cut_off", "cut_off"]);
    expect(r.truncated).toBe(true);
  });

  it("one relay's many events do not keep the others paging a second at a time", async () => {
    const shared = events(200, (i) => 100 + i);
    const set = [
      { relay: "a", held: [...shared, ...events(600, (i) => 1000 + i)], cap: 500 },
      ...["b", "c", "d"].map((relay) => ({ relay, held: shared, cap: 150 })),
    ];
    const r = await readPages(relays(set), FILTER);
    expect(r.events).toHaveLength(800);
    expect(states(r)).toEqual(["complete", "complete", "complete", "complete"]);
    expect(r.pages).toBeLessThanOrEqual(8);
  });

  it("a page is what the relay sent: events the reader drops fill it, so the read goes on", async () => {
    const sought = one(500);
    const held = [sought, ...events(700, (i) => 1000 + i)];
    const pad = (f: Filter) => (f.until === undefined ? 0 : 100);
    const r = await readPages(relays([{ relay: "a", held, cap: 300, pad }]), FILTER);
    expect(ids(r).has(sought.id)).toBe(true);
  });

  it("dropped events beside kept ones at one second: the read asks at that second once, then reads on, complete", async () => {
    const sought = one(500);
    const held = [sought, one(2000), ...events(50, (i) => 1000 + i)];
    // Page 1: the newest kept event and 299 the reader drops; below it, plain pages.
    const pad = (f: Filter) => (f.until === undefined ? 299 : 0);
    const calls: Filter[] = [];
    const r = await readPages(relays([{ relay: "a", held, cap: 300, pad }], calls), FILTER);
    expect(ids(r).has(sought.id)).toBe(true);
    expect(states(r)).toEqual(["complete"]);
    expect(calls.map((f) => f.until)).toEqual([undefined, 2000]);
  });

  it("dropped events at that second too: asked at it once, then stepped past, and cut off there", async () => {
    const sought = one(500);
    const held = [sought, ...events(301, () => 2000)];
    const pad = () => 150;
    const r = await readPages(relays([{ relay: "a", held, cap: 300, pad }]), FILTER);
    expect(ids(r).has(sought.id)).toBe(true);
    expect(states(r)).toEqual(["cut_off"]);
  });

  it("a full page of only events the reader drops leaves nothing to page by: cut off", async () => {
    const r = await readPages(relays([{ relay: "a", held: events(400, (i) => 1000 + i), cap: 300, pad: () => 300 }]), FILTER);
    expect(states(r)).toEqual(["cut_off"]);
    expect(r.truncated).toBe(true);
  });

  it("with no counts, a page is the events read back: read until one comes back shorter", async () => {
    const sought = one(500);
    const held = [sought, ...events(400, (i) => 1000 + i)];
    const counted = relays(["a", "b"].map((relay) => ({ relay, held, cap: 300 })));
    const query = async (f: Filter) => {
      const res = await counted(f);
      return { events: res.events, relayStatus: res.relayStatus.map(({ relay, eose }) => ({ relay, eose })) };
    };
    const r = await readPages(query, FILTER);
    expect(ids(r).has(sought.id)).toBe(true);
    expect(states(r)).toEqual(["complete", "complete"]);
  });

  it("a query that names no relay is read as one: to its end, with no relay states", async () => {
    const counted = relays([{ relay: "a", held: events(700, (i) => 1000 + i), cap: 300 }]);
    const r = await readPages(async (f) => ({ events: (await counted(f)).events }), FILTER);
    expect(r.events).toHaveLength(700);
    expect(r.relayStatus).toBeUndefined();
    expect(r.truncated).toBe(false);
  });

  it("a query that reports an empty relay list asked no relay", async () => {
    const r = await readPages(async () => ({ events: [], relayStatus: [] }), FILTER);
    expect(r.relayStatus).toEqual([]);
  });
});

describe("readPages: a page under MIN_PAGE ends a relay's read", () => {
  it("fewer than MIN_PAGE events: one page, complete", async () => {
    const r = await readPages(relays(FOUR.map((relay) => ({ relay, held: events(MIN_PAGE - 1, (i) => 1000 + i) }))), FILTER);
    expect(r.pages).toBe(1);
    expect(states(r)).toEqual(["complete", "complete", "complete", "complete"]);
  });

  it("MIN_PAGE events: the read asks again", async () => {
    const r = await readPages(relays([{ relay: "a", held: events(MIN_PAGE, (i) => 1000 + i) }]), FILTER);
    expect(r.pages).toBe(2);
    expect(states(r)).toEqual(["complete"]);
  });

  it("a relay that caps below MIN_PAGE and does not declare it is taken as whole on its first page: the stated limit", async () => {
    const r = await readPages(relays([{ relay: "a", held: events(500, (i) => 1000 + i), cap: MIN_PAGE - 1 }]), FILTER);
    expect([r.pages, r.events.length]).toEqual([1, MIN_PAGE - 1]);
    expect(states(r)).toEqual(["complete"]);
  });

  it("a limit below MIN_PAGE: a page of `limit` is a full page", async () => {
    const r = await readPages(relays([{ relay: "a", held: events(120, (i) => 1000 + i) }]), FILTER, { limit: 50 });
    expect(r.events).toHaveLength(120);
    expect(states(r)).toEqual(["complete"]);
  });

  it("a relay whose NIP-11 max_limit is below MIN_PAGE and that sent something is cut off", async () => {
    const set = FOUR.map((relay) => ({ relay, held: events(30, (i) => 1000 + i) }));
    const declared: Record<string, number> = { a: 50, b: 500 };
    const asked: string[] = [];
    const maxLimit = async (relay: string) => {
      asked.push(relay);
      if (relay === "c") throw new Error("unreachable");
      return declared[relay];
    };
    const r = await readPages(relays(set), FILTER, { maxLimit });
    expect(states(r)).toEqual(["cut_off", "complete", "complete", "complete"]);
    expect(r.truncated).toBe(true);
    expect(asked.sort()).toEqual(FOUR);
  });

  it("the declared page is held to the page that ends a read: 100, or limit when smaller", async () => {
    const held = events(30, (i) => 1000 + i);
    const read = async (declared: number, limit?: number) =>
      states(await readPages(relays([{ relay: "a", held }]), FILTER, { maxLimit: async () => declared, ...(limit ? { limit } : {}) }));
    expect(await read(100)).toEqual(["complete"]);
    expect(await read(99)).toEqual(["cut_off"]);
    expect(await read(60, 50)).toEqual(["complete"]);
    expect(await read(40, 50)).toEqual(["cut_off"]);
  });

  it("one that declares so and holds nothing there is complete: an empty answer needs no page size", async () => {
    const r = await readPages(relays([{ relay: "a", held: [] }]), FILTER, { maxLimit: async () => 50 });
    expect(states(r)).toEqual(["complete"]);
    expect(r.truncated).toBe(false);
  });
});

describe("readPages: a relay that stops answering stays stopped", () => {
  const held = events(700, (i) => 1000 + i);

  it("one that answers page 1 and not page 2 is cut off", async () => {
    const set = [
      { relay: "a", held, cap: 300, answers: (f: Filter) => f.until === undefined },
      ...["b", "c", "d"].map((relay) => ({ relay, held, cap: 300 })),
    ];
    const r = await readPages(relays(set), FILTER);
    expect(states(r)).toEqual(["cut_off", "complete", "complete", "complete"]);
  });

  it("one that misses one page and answers the next is still cut off", async () => {
    let n = 0;
    const set = [
      { relay: "a", held, cap: 300, answers: () => n++ !== 1 },
      ...["b", "c", "d"].map((relay) => ({ relay, held, cap: 300 })),
    ];
    const r = await readPages(relays(set), FILTER);
    expect(r.pages).toBeGreaterThan(2);
    expect(states(r)).toEqual(["cut_off", "complete", "complete", "complete"]);
  });

  it("one that never answers is no answer, not cut off", async () => {
    const set = [{ relay: "a", held, answers: () => false }, ...["b", "c", "d"].map((relay) => ({ relay, held, cap: 300 }))];
    const r = await readPages(relays(set), FILTER);
    expect(states(r)).toEqual(["no_answer", "complete", "complete", "complete"]);
  });

  it("one first met after page 1 missed the pages before it", async () => {
    const counted = relays(["a", "b"].map((relay) => ({ relay, held, cap: 300 })));
    const query = async (f: Filter) => {
      const res = await counted(f);
      return f.until === undefined ? { events: res.events, relayStatus: res.relayStatus.slice(0, 1) } : res;
    };
    const r = await readPages(query, FILTER);
    expect(r.relayStatus).toEqual([
      { relay: "a", eose: true, state: "complete" },
      { relay: "b", eose: false, state: "cut_off" },
    ]);
  });

  it("one missing from a later answer stopped there: cut off, and the read does not wait on it", async () => {
    const counted = relays(["a", "b"].map((relay) => ({ relay, held, cap: 300 })));
    const query = async (f: Filter) => {
      const res = await counted(f);
      return f.until === undefined ? res : { events: res.events, relayStatus: res.relayStatus.slice(0, 1) };
    };
    const r = await readPages(query, FILTER);
    expect(states(r)).toEqual(["complete", "cut_off"]);
    expect(r.pages).toBeLessThanOrEqual(4);
  });

  it("one missing from the page after a step past one second stopped there", async () => {
    const flood = events(301, () => 2000);
    let n = 0;
    const set = [
      { relay: "a", held: flood, cap: 300 },
      { relay: "b", held: flood, cap: 300 },
    ];
    const both = relays(set);
    const query = async (f: Filter) => {
      const res = await both(f);
      return n++ === 0 ? res : { events: res.events, relayStatus: res.relayStatus.slice(0, 1) };
    };
    const r = await readPages(query, FILTER);
    expect(states(r)).toEqual(["cut_off", "cut_off"]);
    expect(r.pages).toBe(3);
  });

  it("a reader that paged a relay itself says how its read ended", async () => {
    const r = await readPages(relays([{ relay: "a", held, state: "cut_off" }, { relay: "b", held, cap: 300 }]), FILTER);
    expect(states(r)).toEqual(["cut_off", "complete"]);
  });
});

describe("readPages: a second holding more than a relay sends in a page", () => {
  it("newer than the one sought: the read steps past it, reads what lies below, and is cut off there", async () => {
    const sought = one(500);
    const held = [sought, ...events(301, () => 2000)];
    const r = await readPages(relays(FOUR.map((relay) => ({ relay, held, cap: 300 }))), FILTER);
    expect(ids(r).has(sought.id)).toBe(true);
    expect(states(r)).toEqual(["cut_off", "cut_off", "cut_off", "cut_off"]);
    expect(r.truncated).toBe(true);
  });

  it("a relay whose own page sits at one second while another's does not: that second is probed, and the read is cut off there", async () => {
    // a's 300 newest are all at 2000, b's 150 spread below them, so no page sits at one second.
    const sought = one(500);
    const set = [
      { relay: "a", held: [sought, ...events(301, () => 2000)], cap: 300 },
      { relay: "b", held: events(150, (i) => 1500 + i), cap: 500 },
    ];
    const r = await readPages(relays(set), FILTER);
    expect(ids(r).has(sought.id)).toBe(true);
    expect(states(r)).toEqual(["cut_off", "complete"]);
    expect(r.truncated).toBe(true);
  });

  it("the oldest second it holds: cut off, since it sends no more than that in a page", async () => {
    const held = [...events(301, () => 2000), ...events(50, (i) => 3000 + i, OTHER_TAG)];
    const calls: Filter[] = [];
    const r = await readPages(relays([{ relay: "a", held, cap: 300 }], calls), FILTER);
    expect(states(r)).toEqual(["cut_off"]);
    expect(r.truncated).toBe(true);
    // The last REQ asks the kinds alone, and nothing it returns is kept.
    expect(calls[calls.length - 1]).toEqual({ kinds: [30110], limit: 500 });
    expect(r.events.every((e) => e.tags[0]![1] === TAG)).toBe(true);
  });

  it("the oldest second's check left unasked by the page bound: cut off", async () => {
    const r = await readPages(relays([{ relay: "a", held: events(301, () => 2000), cap: 300 }]), FILTER, { maxPages: 2 });
    expect(r.pages).toBe(2);
    expect(states(r)).toEqual(["cut_off"]);
  });

  it("MIN_PAGE events at its oldest second, on a relay that sends more than that in a page: complete", async () => {
    const held = [...events(MIN_PAGE, () => 2000), ...events(50, (i) => 3000 + i, OTHER_TAG)];
    const r = await readPages(relays([{ relay: "a", held, cap: 300 }]), FILTER);
    expect(states(r)).toEqual(["complete"]);
    expect(r.truncated).toBe(false);
  });

  it("MIN_PAGE at its oldest second on a relay holding nothing else of those kinds: cut off, as a cap of that size would be", async () => {
    const r = await readPages(relays([{ relay: "a", held: events(MIN_PAGE, () => 2000), cap: 300 }]), FILTER);
    expect(states(r)).toEqual(["cut_off"]);
  });
});

describe("readPages: bounded", () => {
  it("a relay that never stops sending events it has not sent before is cut off at the page bound", async () => {
    const calls: Filter[] = [];
    let n = 0;
    const query = async (f: Filter) => {
      calls.push(f);
      const top = f.until ?? 1_000_000;
      const fresh = events(MIN_PAGE, (i) => top - i).map((e) => ({ ...e, id: `e${(n++).toString(16)}`.padEnd(64, "0") }));
      return { events: fresh, relayStatus: [{ relay: "endless", eose: true, events: MIN_PAGE, rejected: 0 }] };
    };
    const r = await readPages(query, FILTER);
    expect(states(r)).toEqual(["cut_off"]);
    expect(r.truncated).toBe(true);
    expect(calls.length).toBe(16);
  });

  it("past 2,000 events the read stops, cut off", async () => {
    const r = await readPages(relays([{ relay: "a", held: events(3000, (i) => 1000 + i), cap: 500 }]), FILTER);
    expect(r.events.length).toBeGreaterThanOrEqual(2000);
    expect(r.events.length).toBeLessThan(2500);
    expect(states(r)).toEqual(["cut_off"]);
    expect(r.truncated).toBe(true);
  });

  it("the read stops once it holds maxEvents with a relay still open", async () => {
    // Pages of 300 overlap by the second they meet at: 300, then 599, then all 600.
    const held = events(600, (i) => 1000 + i);
    const at = async (maxEvents: number) => states(await readPages(relays([{ relay: "a", held, cap: 300 }]), FILTER, { maxEvents }));
    expect(await at(599)).toEqual(["cut_off"]);
    expect(await at(600)).toEqual(["complete"]);
  });

  it("reads that share a budget stop when it is spent", async () => {
    const budget = { left: 3 };
    const query = relays([{ relay: "a", held: events(1000, (i) => 1000 + i), cap: 100 }]);
    const first = await readPages(query, FILTER, { budget });
    const second = await readPages(query, FILTER, { budget });
    expect(budget.left).toBe(0);
    expect([first.truncated, second.truncated]).toEqual([true, true]);
    expect(second.pages).toBe(0);
    expect(states(second)).toBeUndefined();
  });
});

describe("readRelays: each relay read alone", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** queryEvents' shape over planted relays, asked one relay at a time. */
  const alone = (set: readonly Relay[], asked: { relays: readonly string[]; timeoutMs: number }[] = []) => {
    const all = relays(set);
    return async (f: Filter, rs: readonly string[], timeoutMs: number) => {
      asked.push({ relays: rs, timeoutMs });
      const res = await all(f);
      const relayStatus = res.relayStatus.filter((s) => rs.includes(s.relay!));
      const kept = new Set(
        set.filter((r) => rs.includes(r.relay)).flatMap((r) => r.held.map((e) => e.id)),
      );
      return { events: res.events.filter((e) => kept.has(e.id)), relayStatus };
    };
  };

  it("one relay's flood cuts off only that relay's read", async () => {
    const sought = one(500);
    const asked: { relays: readonly string[]; timeoutMs: number }[] = [];
    const set = [
      { relay: "wss://a", held: [sought, ...events(2600, (i) => 1000 + i)], cap: 500 },
      ...["wss://b", "wss://c"].map((relay) => ({ relay, held: [sought], cap: 300 })),
    ];
    const r = await readRelays(FILTER, ["wss://a", "wss://b", "wss://c"], { query: alone(set, asked) });
    expect(r.relayStatus).toEqual([
      { relay: "wss://a", eose: false, state: "cut_off" },
      { relay: "wss://b", eose: true, state: "complete" },
      { relay: "wss://c", eose: true, state: "complete" },
    ]);
    expect(ids(r).has(sought.id)).toBe(true);
    expect(r.truncated).toBe(true);
    expect(asked.every((a) => a.relays.length === 1 && a.timeoutMs <= 4000)).toBe(true);
  });

  it("a flood on any relay, not only the first, truncates the read", async () => {
    const set = [
      { relay: "wss://a", held: [one(500)], cap: 300 },
      { relay: "wss://b", held: events(2600, (i) => 1000 + i), cap: 500 },
    ];
    const r = await readRelays(FILTER, ["wss://a", "wss://b"], { query: alone(set) });
    expect(r.relayStatus.map((s) => s.state)).toEqual(["complete", "cut_off"]);
    expect(r.truncated).toBe(true);
  });

  it("a relay that stops answering before its deadline is cut off, and the read not truncated by it", async () => {
    const held = [one(500), ...events(300, (i) => 1000 + i)];
    const set = [{ relay: "wss://a", held, cap: 300, answers: (f: Filter) => f.until === undefined }];
    const r = await readRelays(FILTER, ["wss://a"], { query: alone(set) });
    expect(r.relayStatus).toEqual([{ relay: "wss://a", eose: false, state: "cut_off" }]);
    expect(r.truncated).toBe(false);
  });

  it("a relay capping at 300 behind 700 newer events is paged to the one behind them", async () => {
    const sought = one(500);
    const held = [sought, ...events(700, (i) => 1000 + i)];
    const r = await readRelays(FILTER, ["wss://a"], { query: alone([{ relay: "wss://a", held, cap: 300 }]) });
    expect(ids(r).has(sought.id)).toBe(true);
    expect(r.relayStatus).toEqual([{ relay: "wss://a", eose: true, state: "complete" }]);
  });

  it("a relay's pages share one deadline: one that cannot page to the end in time is cut off", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-06T00:00:00Z") });
    const held = events(1000, (i) => 1000 + i);
    const planted = alone([{ relay: "wss://a", held, cap: 300 }]);
    const left: number[] = [];
    const slow = async (f: Filter, rs: readonly string[], timeoutMs: number) => {
      left.push(timeoutMs);
      vi.setSystemTime(Date.now() + 1500);
      return planted(f, rs, timeoutMs);
    };
    const r = await readRelays(FILTER, ["wss://a"], { query: slow, timeoutMs: 4000 });
    expect(left).toEqual([4000, 2500, 1000]);
    expect(r.relayStatus).toEqual([{ relay: "wss://a", eose: false, state: "cut_off" }]);
    expect(r.truncated).toBe(true);
  });

  it("with your own query, NIP-11 is not read unless you pass maxLimit", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    // A relay no other test names, so no earlier read of it is cached.
    const relay = "wss://nip11-own-query.example";
    await readRelays(FILTER, [relay], { query: alone([{ relay, held: [one(1)] }]) });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("relayMaxLimit: the page size a relay's NIP-11 document declares", () => {
  afterEach(() => vi.unstubAllGlobals());

  const answer = (body: unknown, ok = true) =>
    vi.fn(async (_url: string, _init?: RequestInit) => ({ ok, status: ok ? 200 : 500, json: async () => body }));

  it("reads limitation.max_limit over https, asking for application/nostr+json, once per relay", async () => {
    const fetch = answer({ limitation: { max_limit: 300 } });
    vi.stubGlobal("fetch", fetch);
    expect(await relayMaxLimit("wss://nip11-a.example")).toBe(300);
    expect(await relayMaxLimit("wss://nip11-a.example")).toBe(300);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("https://nip11-a.example");
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get("accept")).toBe("application/nostr+json");
    expect(fetch.mock.calls[0]![1]!.redirect).toBe("error");
  });

  it("no limit declared, or not a positive number: undefined", async () => {
    vi.stubGlobal("fetch", answer({ limitation: { max_limit: "300" } }));
    expect(await relayMaxLimit("wss://nip11-b.example")).toBeUndefined();
    vi.stubGlobal("fetch", answer({ name: "x" }));
    expect(await relayMaxLimit("wss://nip11-c.example")).toBeUndefined();
  });

  it("a document that cannot be read is undefined, and read again next time", async () => {
    const down = vi.fn(async () => {
      throw new Error("down");
    });
    vi.stubGlobal("fetch", down);
    expect(await relayMaxLimit("wss://nip11-d.example")).toBeUndefined();
    vi.stubGlobal("fetch", answer({ limitation: { max_limit: 50 } }));
    expect(await relayMaxLimit("wss://nip11-d.example")).toBe(50);
    expect(down).toHaveBeenCalledTimes(1);
  });
});
