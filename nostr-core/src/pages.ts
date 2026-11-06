// ─────────────────────────────────────────────────────────────────────────
// readPages: a read paged with `until` to its end on every relay, whatever
// page size each one caps at.
// ─────────────────────────────────────────────────────────────────────────

import type { Filter, NostrEvent } from "./index";

/**
 * How one relay's paged read ended. complete: it sent all it holds for the
 * filter. cut_off: it sent something and could not be read to the end (it
 * stopped answering, a bound stopped it, or it may hold more at one second
 * than it sends in a page). no_answer: it sent nothing and no EOSE.
 */
export type PagedReadState = "complete" | "cut_off" | "no_answer";

/**
 * One relay's answer to one REQ: whether it sent EOSE and, where known, what
 * it sent (`events` kept and `rejected`, as queryEvents counts them). A reader
 * that paged the relay itself gives `state` instead.
 */
export interface PageAnswer {
  relay?: string;
  eose: boolean;
  state?: PagedReadState;
  events?: number;
  rejected?: number;
}

/** One REQ over one relay or several: queryEvents, or a test's. */
export type PageQuery = (filter: Filter) => Promise<{
  events: NostrEvent[];
  relayStatus?: readonly PageAnswer[];
}>;

/** How far one paged read goes. */
export interface PageBounds {
  /** Events asked for per page; default 500. */
  limit?: number;
  /** Distinct events read before the read stops; default 2,000. */
  maxEvents?: number;
  /** REQs made before the read stops, so a relay that sends a few at a time still ends; default 16. */
  maxPages?: number;
  /** REQs left across several reads: each takes one, and a read stops when none is left. */
  budget?: { left: number };
  /** The `max_limit` a relay's NIP-11 document declares, if any (`relayMaxLimit`). */
  maxLimit?: (relay: string) => Promise<number | undefined>;
}

/** A read paged to its end: every event it read, and how each relay's read ended. */
export interface PagedRead {
  /** Every distinct event read, newest first. */
  events: NostrEvent[];
  /** Per relay, how its read ended. Absent when the query named no relay. */
  relayStatus?: { relay?: string; eose: boolean; state: PagedReadState }[];
  /** A relay that may hold more was stopped: by a bound, by a second holding
   *  more than it sends in a page, or by a page size it declares below the
   *  page that ends a read (MIN_PAGE, or `limit` when smaller). */
  truncated: boolean;
  /** REQs made. */
  pages: number;
}

/**
 * The smallest page a relay is taken to send when it holds more. A page under
 * it (or under `limit`, when that is smaller) ends a relay's read; a relay
 * whose NIP-11 document declares a `max_limit` below it is cut off.
 */
export const MIN_PAGE = 100;

const PAGE_LIMIT = 500;
const PAGE_MAX_EVENTS = 2000;
const PAGE_MAX_PAGES = 16;
/** The key of a query that names no relay: its answer is read as one relay's. */
const UNION = "#union";

/** One relay's read across the pages. */
interface Paging {
  relay?: string;
  state: "open" | PagedReadState;
  /** The largest page it sent: its own cap is at least that. */
  largest: number;
  sent: boolean;
  /** A second at or above the oldest event of its last page. */
  reached?: number;
  /** The second the read stepped past while this relay's page sat wholly at it, and what it sent there. */
  past?: number;
  pastSent?: number;
  /** It may hold more at one second than it sends in a page. */
  capped: boolean;
  declared?: Promise<number | undefined>;
}

/**
 * Reads `filter` to its end on every relay `query` asks, paging with `until`
 * (inclusive; events already read are skipped). Relays answer newest first up
 * to a cap of their own, which can sit below `limit`. A relay's read ends on a
 * page that is empty, under MIN_PAGE (or `limit`), or shorter than a page it
 * sent before. Each page asks at the oldest second a relay still open sent, so
 * no relay skips what it holds; when relays hold different events, one probe
 * of the seconds above the page's oldest tells which of them sent only there.
 * A page that sits wholly at one second cannot be paged past by `until`: the
 * read steps to the second before (first asking at that second when the page
 * held events the reader drops, whose seconds it cannot see). A relay that
 * then sends anything sent a full page of its own at that second and may hold
 * more there, so its read is cut off. One that sends nothing is complete only
 * if it sends more than that in a page, which one REQ for the filter's kinds
 * alone tells. A relay that misses a page stopped, and stays stopped: cut off
 * if it sent anything, else no answer. Past a bound, a relay still open is cut
 * off. A relay is taken to send at least MIN_PAGE a page; one that caps below
 * it without declaring so in NIP-11 is not told apart.
 */
export async function readPages(
  query: PageQuery,
  filter: Filter,
  bounds: PageBounds = {},
): Promise<PagedRead> {
  const limit = bounds.limit ?? PAGE_LIMIT;
  const maxEvents = bounds.maxEvents ?? PAGE_MAX_EVENTS;
  const maxPages = bounds.maxPages ?? PAGE_MAX_PAGES;
  const short = Math.min(MIN_PAGE, limit);
  const seen = new Map<string, NostrEvent>();
  const relays = new Map<string, Paging>();
  let reported = false;
  let truncated = false;
  let pages = 0;
  let until: number | undefined;

  const spent = () =>
    pages >= maxPages || (bounds.budget !== undefined && bounds.budget.left <= 0);
  // One REQ, each relay's answer by key. A query that names no relay is read
  // as one relay that sent every event. Events are kept unless `keep` is false.
  const ask = async (f: Filter, keep = true) => {
    if (bounds.budget) bounds.budget.left--;
    pages++;
    const res = await query(f);
    const events = res.events ?? [];
    if (keep) for (const e of events) if (!seen.has(e.id)) seen.set(e.id, e);
    if (res.relayStatus) reported = true;
    const status = res.relayStatus ?? [];
    const answers: [string, PageAnswer][] =
      status.length > 0
        ? status.map((r, i) => [r.relay ?? `#${i}`, r])
        : [[UNION, { eose: true }]];
    return { events, answers: new Map(answers) };
  };
  // What one relay sent: events kept and dropped, else the events given.
  const sentOn = (r: PageAnswer, events: readonly NostrEvent[]) =>
    r.events === undefined ? events.length : r.events + (r.rejected ?? 0);
  // A relay that did not answer stopped.
  const stop = (p: Paging, r: PageAnswer | undefined) => {
    const sentHere = r?.events !== undefined && r.events + (r.rejected ?? 0) > 0;
    p.state = p.sent || sentHere ? "cut_off" : "no_answer";
  };
  const meet = (key: string, r: PageAnswer) => {
    const p: Paging = { relay: r.relay, state: "open", largest: 0, sent: false, capped: false };
    if (r.relay && bounds.maxLimit) {
      p.declared = bounds.maxLimit(r.relay).catch(() => undefined);
    }
    relays.set(key, p);
    return p;
  };
  // One REQ over a window of seconds: what each relay still open sent there.
  const probe = async (window: { since: number; until?: number }) => {
    if (spent()) return null;
    const res = await ask({ ...filter, limit, ...window });
    const inWindow = res.events.filter(
      (e) =>
        e.created_at >= window.since &&
        (window.until === undefined || e.created_at <= window.until),
    );
    const counts = new Map<Paging, number>();
    for (const [key, p] of relays) {
      if (p.state !== "open") continue;
      const r = res.answers.get(key);
      if (r?.state) p.state = r.state;
      else if (!r || !r.eose) stop(p, r);
      else {
        const sent = sentOn(r, inWindow);
        if (sent > 0) p.sent = true;
        counts.set(p, sent);
      }
    }
    for (const [key, r] of res.answers) if (!relays.has(key)) stop(meet(key, r), r);
    return counts;
  };
  // One REQ for the filter's kinds alone, nothing kept: what each relay sends
  // there is the most it sends a page, or all it holds of those kinds.
  const pageSizes = async () => {
    if (spent()) return null;
    const res = await ask({ ...(filter.kinds ? { kinds: filter.kinds } : {}), limit }, false);
    const sizes = new Map<Paging, number>();
    for (const [key, p] of relays) {
      const r = res.answers.get(key);
      if (r && r.eose && !r.state) sizes.set(p, sentOn(r, res.events));
    }
    return sizes;
  };

  for (;;) {
    const open = [...relays.values()].filter((p) => p.state === "open");
    if (pages > 0 && open.length === 0) break;
    if (spent() || seen.size >= maxEvents) {
      for (const p of open) p.state = "cut_off";
      truncated = true;
      break;
    }
    const at = until;
    const res = await ask({ ...filter, limit, ...(at === undefined ? {} : { until: at }) });
    // What a relay could send for this page, newest first.
    const page = res.events
      .filter((e) => at === undefined || e.created_at <= at)
      .sort((a, b) => b.created_at - a.created_at);
    for (const [key, p] of relays) {
      if (p.state === "open" && !res.answers.has(key)) stop(p, undefined);
    }
    const unsure: Paging[] = [];
    // A relay still open sent events the reader dropped: their seconds are unknown.
    let dropped = false;
    for (const [key, r] of res.answers) {
      let p = relays.get(key);
      if (!p) {
        p = meet(key, r);
        // A relay first met after page 1 missed what the pages before it asked.
        if (pages > 1) {
          stop(p, r);
          continue;
        }
      }
      if (p.state !== "open") continue;
      if (r.state) {
        p.state = r.state;
        continue;
      }
      if (!r.eose) {
        stop(p, r);
        continue;
      }
      const sent = sentOn(r, page);
      if (sent > 0) p.sent = true;
      if (p.past !== undefined) {
        // Asked below a second its last page sat wholly at: whatever it sends
        // now it held then and did not send, so that second may hold more.
        if (sent > 0) p.capped = true;
        // Nothing older: whether that second held more is settled below.
        else if (p.pastSent! > 1) unsure.push(p);
        p.past = undefined;
      }
      if (sent === 0 || sent < short || sent < p.largest) {
        p.state = p.capped ? "cut_off" : "complete";
        continue;
      }
      p.largest = sent;
      const kept = r.events ?? page.length;
      const oldest = page[Math.min(kept, page.length) - 1];
      if (!oldest) {
        // It sent only what the reader drops: nothing to page by.
        p.capped = true;
        p.state = "cut_off";
        continue;
      }
      // Its kept events are among the page's, so its oldest is no newer than this.
      p.reached = oldest.created_at;
      if ((r.rejected ?? 0) > 0) dropped = true;
    }
    if (unsure.length > 0) {
      const sizes = await pageSizes();
      for (const p of unsure) {
        if (!sizes || (sizes.get(p) ?? 0) <= p.pastSent!) {
          p.capped = true;
          p.state = "cut_off";
        }
      }
    }
    const still = [...relays.values()].filter((p) => p.state === "open");
    if (still.length === 0) continue;
    // A page that sits wholly at one second: asking at that second again
    // brings the same pages back, so the read steps past it. Events the reader
    // dropped may sit above that second, so a page that held some is asked at
    // it once first.
    const top = page[0]!.created_at;
    if (top === page[page.length - 1]!.created_at) {
      if (dropped && at !== top) {
        until = top;
        continue;
      }
      for (const p of still) {
        p.past = top;
        p.pastSent = p.largest;
      }
      until = top - 1;
      continue;
    }
    // The next page asks at the oldest second any relay still open sent. Each
    // one's oldest is at or above the page's oldest and at or below its bound;
    // other relays' events can crowd the bound up. Relays that sent only above
    // the page's oldest take their bound; the rest stopped at the page's oldest.
    const floor = page[page.length - 1]!.created_at;
    let next = floor;
    if (still.some((p) => p.reached! > floor)) {
      const above = await probe({ since: floor + 1, ...(at === undefined ? {} : { until: at }) });
      if (!above) continue;
      const held = still.filter((p) => p.state === "open" && (above.get(p) ?? 0) >= p.largest);
      if (held.length > 0) next = Math.max(...held.map((p) => p.reached!));
    }
    if (next !== at) {
      until = next;
      continue;
    }
    // Stuck at `at`: the read steps past it. One probe of that second tells
    // which relays' pages sat wholly there.
    const atSecond = await probe({ since: at, until: at });
    if (!atSecond) continue;
    for (const p of still) {
      const there = atSecond.get(p) ?? 0;
      if (p.state === "open" && p.reached === at && there >= p.largest) {
        p.past = at;
        p.pastSent = there;
      }
    }
    until = at - 1;
  }

  // A relay that declares it sends fewer than the page that ends a read
  // cannot be read past a page by this rule.
  for (const p of relays.values()) {
    if (!p.declared || !p.sent || p.state !== "complete") continue;
    const declared = await p.declared;
    if (declared !== undefined && declared < short) {
      p.capped = true;
      p.state = "cut_off";
    }
  }
  truncated = truncated || [...relays.values()].some((p) => p.capped);
  const relayStatus = reported
    ? [...relays.entries()]
        .filter(([key]) => key !== UNION)
        .map(([, p]) => {
          const state: PagedReadState = p.state === "open" ? "cut_off" : p.state;
          return { ...(p.relay ? { relay: p.relay } : {}), eose: state === "complete", state };
        })
    : undefined;
  return {
    events: [...seen.values()].sort((a, b) => b.created_at - a.created_at),
    ...(relayStatus ? { relayStatus } : {}),
    truncated,
    pages,
  };
}

const declaredLimits = new Map<string, Promise<number | undefined>>();

/**
 * Where relay `url`'s NIP-11 document is: a scheme the URL parser reads as ws
 * or wss, in any case, made http or https, and the rest of `url` as written.
 */
function nip11Url(url: string): string {
  let protocol: string;
  try {
    ({ protocol } = new URL(url));
  } catch {
    return url;
  }
  if (protocol !== "ws:" && protocol !== "wss:") return url;
  // The parser's scheme ends at the first colon in `url`.
  return (protocol === "wss:" ? "https:" : "http:") + url.slice(url.indexOf(":") + 1);
}

/**
 * The `max_limit` relay `url`'s NIP-11 document declares, or undefined when it
 * declares none or the document cannot be read. A redirect is not followed: it
 * is a document that cannot be read. A declared limit is kept for the life of
 * the process; a failed read is tried again next time.
 */
export function relayMaxLimit(url: string, timeoutMs = 3000): Promise<number | undefined> {
  const known = declaredLimits.get(url);
  if (known) return known;
  const read = (async (): Promise<number | undefined> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(nip11Url(url), {
        headers: { Accept: "application/nostr+json" },
        redirect: "error",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`NIP-11 ${res.status}`);
      const doc = (await res.json()) as { limitation?: { max_limit?: unknown } } | null;
      const n = doc?.limitation?.max_limit;
      return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
    } finally {
      clearTimeout(timer);
    }
  })().catch(() => {
    declaredLimits.delete(url);
    return undefined;
  });
  declaredLimits.set(url, read);
  return read;
}
