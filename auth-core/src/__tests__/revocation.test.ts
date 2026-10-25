import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHmac } from "node:crypto";

import {
  _resetFamilyRevocationCheckForTests,
  createRevocationCheck,
  familyRevocationCheck,
  integratorRevocationCheck,
  revocationKey,
} from "../index";

/**
 * The revocation check every family site runs on a verified session. It must
 * refuse an ended session within one cache period, ask the auth host at most
 * once per period however many requests arrive, and, when the host cannot be
 * reached, keep serving reads while refusing writes it can no longer vouch for.
 */

const JTI = "0123456789abcdef0123456789abcdef";
const SUB = "11111111-1111-4111-8111-111111111111";
const FEED_URL = "https://issuer.test/api/auth/revocations";

let clock = 1_800_000_000_000;
const now = () => clock;
const nowSec = () => Math.floor(clock / 1000);

type Feed = { v: 1; at: number; tokens: string[]; accounts: Record<string, number> };
let feed: Feed;
let reachable: boolean;
let fetches: Array<{ url: string; authorization: string | null }>;

const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
  fetches.push({
    url: String(url),
    authorization: new Headers(init?.headers).get("authorization"),
  });
  if (!reachable) throw new TypeError("fetch failed");
  return Response.json(feed);
}) as unknown as typeof fetch;

const check = (extra: Parameters<typeof createRevocationCheck>[0] = {}) =>
  createRevocationCheck({ url: FEED_URL, token: "site-token", fetch: fakeFetch, now, ...extra });

const session = (over: Record<string, unknown> = {}) => ({
  jti: JTI,
  sub: SUB,
  iat: nowSec() - 3600,
  ...over,
});

beforeEach(() => {
  clock = 1_800_000_000_000;
  feed = { v: 1, at: nowSec(), tokens: [], accounts: {} };
  reachable = true;
  fetches = [];
});

afterEach(() => {
  _resetFamilyRevocationCheckForTests();
  vi.unstubAllEnvs();
});

describe("revocationKey", () => {
  // The same vectors are in oc-www src/lib/auth/revocation.test.ts.
  it("derives the key the auth host writes", async () => {
    expect(await revocationKey("jti", JTI)).toBe("A4v7EsA883VaVMw9nkd5yg");
    expect(await revocationKey("sub", SUB)).toBe("WotL-bgo8QifkPj48P58LA");
  });
});

describe("createRevocationCheck", () => {
  it("passes a session the feed does not name, with the site's own token", async () => {
    const c = check();
    expect(await c.status(session())).toBe("live");
    expect(await c.refuses(session(), "POST")).toBe(false);
    expect(fetches).toEqual([{ url: FEED_URL, authorization: "Bearer site-token" }]);
  });

  it("refuses a token the feed names, for reads as well as writes", async () => {
    feed.tokens = [await revocationKey("jti", JTI)];
    const c = check();
    expect(await c.status(session())).toBe("revoked");
    expect(await c.refuses(session(), "GET")).toBe(true);
    expect(await c.status(session({ jti: "another" }))).toBe("live");
  });

  it("refuses every token of an account issued before its cutoff, and none after", async () => {
    const cutoff = nowSec() - 60;
    feed.accounts = { [await revocationKey("sub", SUB)]: cutoff };
    const c = check();
    expect(await c.status(session({ iat: cutoff - 1 }))).toBe("revoked");
    expect(await c.status(session({ iat: cutoff }))).toBe("live");
    // No iat to compare is no proof it came after.
    expect(await c.status(session({ iat: undefined }))).toBe("revoked");
    expect(await c.status(session({ sub: "someone-else", iat: cutoff - 1 }))).toBe("live");
  });

  it("asks the host once per period, however many requests arrive", async () => {
    const c = check();
    await Promise.all(Array.from({ length: 50 }, () => c.status(session())));
    expect(fetches).toHaveLength(1);
    clock += 59_000;
    await c.status(session());
    expect(fetches).toHaveLength(1);
    clock += 2_000;
    await c.status(session());
    expect(fetches).toHaveLength(2);
  });

  it("refuses within one period of the host ending a session", async () => {
    const c = check();
    expect(await c.status(session())).toBe("live");
    feed.tokens = [await revocationKey("jti", JTI)];
    clock += 30_000;
    expect(await c.status(session())).toBe("live");
    clock += 31_000;
    expect(await c.status(session())).toBe("revoked");
  });

  it("with the host down from the start: reads pass, writes are refused", async () => {
    reachable = false;
    const c = check();
    expect(await c.status(session())).toBe("unverified");
    expect(await c.refuses(session(), "GET")).toBe(false);
    expect(await c.refuses(session(), "head")).toBe(false);
    expect(await c.refuses(session(), "POST")).toBe(true);
    expect(await c.refuses(session(), "DELETE")).toBe(true);
    expect(await c.refuses(session())).toBe(true);
  });

  it("keeps the last copy through an outage, and refuses writes once it is 10 minutes old", async () => {
    feed.tokens = [await revocationKey("jti", "ended")];
    const c = check();
    await c.status(session());
    reachable = false;
    clock += 5 * 60_000;
    expect(await c.refuses(session(), "POST")).toBe(false);
    expect(await c.status(session({ jti: "ended" }))).toBe("revoked");
    clock += 6 * 60_000;
    expect(await c.status(session())).toBe("unverified");
    expect(await c.refuses(session(), "GET")).toBe(false);
    expect(await c.refuses(session(), "POST")).toBe(true);
    // What the copy already knows is ended stays ended.
    expect(await c.status(session({ jti: "ended" }))).toBe("revoked");
    reachable = true;
    clock += 10_000;
    expect(await c.status(session())).toBe("live");
  });

  it("waits before asking a failing host again", async () => {
    reachable = false;
    const c = check();
    await c.status(session());
    await c.status(session());
    expect(fetches).toHaveLength(1);
    clock += 10_001;
    await c.status(session());
    expect(fetches).toHaveLength(2);
  });

  it("treats a refusal or a body it cannot read as the host being down", async () => {
    const bad = [
      new Response("no", { status: 401 }),
      Response.json({ v: 2, tokens: [], accounts: {} }),
      Response.json({ v: 1, tokens: "x", accounts: {} }),
      new Response("not json"),
    ];
    for (const res of bad) {
      const c = check({ fetch: (async () => res) as unknown as typeof fetch });
      expect(await c.refuses(session(), "POST")).toBe(true);
    }
  });

  it("never reads a list it cannot read in full as nothing ended", async () => {
    const t = nowSec();
    const sub = await revocationKey("sub", SUB);
    const bodies = [
      // An account ended with a cutoff that is not a number: dropping it would keep the session live.
      JSON.stringify({ v: 1, at: t, tokens: [], accounts: { [sub]: String(t) } }),
      // A cutoff too large for a double parses as Infinity.
      `{"v":1,"at":${t},"tokens":[],"accounts":{"${sub}":1${"0".repeat(400)}}}`,
      JSON.stringify({ v: 1, at: t, tokens: [42], accounts: {} }),
      JSON.stringify({ v: 1, at: t, tokens: [], accounts: [] }),
      JSON.stringify({ v: 1, at: t, tokens: [], accounts: {}, handles: "x" }),
    ];
    for (const body of bodies) {
      const c = check({ fetch: (async () => new Response(body)) as unknown as typeof fetch });
      expect(await c.refuses(session(), "POST"), body.slice(0, 80)).toBe(true);
    }
  });

  it("gives up on a host that does not answer in time", async () => {
    const hang = (async (_u: unknown, init?: RequestInit) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      )) as unknown as typeof fetch;
    const c = createRevocationCheck({ url: FEED_URL, token: "t", fetch: hang, timeoutMs: 20 });
    expect(await c.status(session())).toBe("unverified");
  });

  it("with no token: passes while developing, refuses writes in production, never fetches", async () => {
    const dev = check({ token: "", developing: true });
    expect(await dev.status(session())).toBe("live");
    const prod = check({ token: "", developing: false });
    expect(await prod.status(session())).toBe("unverified");
    expect(await prod.refuses(session(), "GET")).toBe(false);
    expect(await prod.refuses(session(), "POST")).toBe(true);
    expect(fetches).toHaveLength(0);
  });
});

describe("createRevocationCheck · a wall clock that steps back", () => {
  // The wall clock steps back an hour while the monotonic clock runs on.
  let mono = 0;
  const steppedBack = (extra: Parameters<typeof createRevocationCheck>[0] = {}) =>
    check({ clock: () => mono, ...extra });

  beforeEach(() => {
    mono = 5_000_000;
  });

  it("does not extend the ten-minute bound on a copy kept through an outage", async () => {
    const c = steppedBack();
    await c.status(session());
    reachable = false;
    clock -= 60 * 60_000;
    mono += 11 * 60_000;
    clock += 11 * 60_000;
    expect(await c.refuses(session(), "POST")).toBe(true);
    expect(await c.refuses(session(), "GET")).toBe(false);
  });

  it("does not extend the bound measured from the list's own time either", async () => {
    let up = true;
    const c = integratorRevocationCheck({
      projectKey: "pk_live_abc123",
      signingSecret: "f".repeat(64),
      fetch: vi.fn(async () => {
        if (!up) throw new TypeError("fetch failed");
        return Response.json({ v: 1, at: nowSec(), tokens: [], accounts: {}, handles: {} });
      }) as unknown as typeof fetch,
      now,
      clock: () => mono,
    })!;
    const tok = { ...session(), aud: "https://site.example", rh: "rh-site" };
    expect(await c.refuses(tok, "POST")).toBe(false);
    up = false;
    // Five minutes back on the wall, eleven on: by its own time the copy is now
    // eleven minutes old, and the step back must not make it look six.
    clock -= 5 * 60_000;
    clock += 11 * 60_000;
    mono += 11 * 60_000;
    expect(await c.refuses(tok, "POST")).toBe(true);
    expect(await c.refuses(tok, "GET")).toBe(false);
  });

  it("does not extend the wait before asking a failing host again", async () => {
    reachable = false;
    const c = steppedBack();
    await c.status(session());
    clock -= 60 * 60_000;
    mono += 10_001;
    await c.status(session());
    expect(fetches).toHaveLength(2);
  });

  it("does not keep a copy past its minute", async () => {
    const c = steppedBack();
    await c.status(session());
    clock -= 60 * 60_000;
    mono += 61_000;
    await c.status(session());
    expect(fetches).toHaveLength(2);
  });
});

describe("createRevocationCheck · a host paused, its monotonic clock stopped", () => {
  // A suspended machine or a restored snapshot: the wall clock moves on, the monotonic one does not.
  let mono = 0;
  const paused = (extra: Parameters<typeof createRevocationCheck>[0] = {}) =>
    check({ clock: () => mono, ...extra });
  const SITE = "https://site.example";
  let list: { v: 1; at: number; tokens: string[]; accounts: Record<string, number>; handles: Record<string, number> };
  let up = true;
  let reads = 0;
  const integrator = () =>
    integratorRevocationCheck({
      projectKey: "pk_live_abc123",
      signingSecret: "f".repeat(64),
      fetch: vi.fn(async () => {
        reads++;
        if (!up) throw new TypeError("fetch failed");
        return Response.json({ ...list, at: nowSec() });
      }) as unknown as typeof fetch,
      now,
      clock: () => mono,
    })!;
  const tok = () => ({ ...session(), aud: SITE, rh: "rh-site" });

  beforeEach(() => {
    mono = 5_000_000;
    list = { v: 1, at: nowSec(), tokens: [], accounts: {}, handles: {} };
    up = true;
    reads = 0;
  });

  it("reads the list again after a pause, and refuses a session ended during it", async () => {
    const c = integrator();
    const t = tok();
    expect(await c.refuses(t, "POST")).toBe(false);
    list.handles = { "rh-site": t.iat + 1 };
    clock += 3 * 3600_000;
    expect(await c.refuses(t, "POST")).toBe(true);
    expect(reads).toBe(2);
  });

  it("does not let a copy from before the pause vouch for a write", async () => {
    const c = paused();
    await c.status(session());
    reachable = false;
    clock += 3 * 3600_000;
    expect(await c.refuses(session(), "POST")).toBe(true);
    expect(await c.refuses(session(), "GET")).toBe(false);
  });

  it("does not stretch the wait before asking a failing host again", async () => {
    reachable = false;
    const c = paused();
    await c.status(session());
    clock += 10_001;
    await c.status(session());
    expect(fetches).toHaveLength(2);
  });

  it("stops refusing writes once a lagging wall clock catches up with the list's own time", async () => {
    // The list says it was made 90 s from now: this clock lags past the 60 s allowed.
    list.at = nowSec() + 90;
    const lagging = integratorRevocationCheck({
      projectKey: "pk_live_abc123",
      signingSecret: "f".repeat(64),
      fetch: vi.fn(async () => Response.json(list)) as unknown as typeof fetch,
      now,
      clock: () => mono,
    })!;
    expect(await lagging.refuses(tok(), "POST")).toBe(true);
    // NTP steps the wall clock forward 31 s; the copy is still inside its minute.
    clock += 31_000;
    mono += 1_000;
    expect(await lagging.refuses(tok(), "POST")).toBe(false);
  });
});

describe("familyRevocationCheck", () => {
  it("is one check per process, read from the environment", async () => {
    vi.stubEnv("OC_REVOCATION_FEED_TOKEN", "env-token");
    vi.stubEnv("OC_AUTH_ISSUER", "https://issuer.test/");
    const real = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      expect(familyRevocationCheck()).toBe(familyRevocationCheck());
      await familyRevocationCheck().status(session());
      await familyRevocationCheck().status(session());
      expect(fetches).toEqual([{ url: FEED_URL, authorization: "Bearer env-token" }]);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("integratorRevocationCheck", () => {
  const PROJECT = "pk_live_abc123";
  const SECRET = "f".repeat(64);
  const SITE = "https://site.example";
  const WWW = "https://www.site.example";
  let seen: Array<{ url: string; headers: Headers }>;
  let lists: Record<string, { v: 1; at: number; tokens: string[]; accounts: Record<string, number>; handles: Record<string, number> }>;
  const signedFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(url), headers: new Headers(init?.headers) });
    const aud = new URL(String(url)).searchParams.get("aud") ?? "";
    return Response.json(lists[aud] ?? { v: 1, at: nowSec(), tokens: [], accounts: {}, handles: {} });
  }) as unknown as typeof fetch;
  const integrator = () =>
    integratorRevocationCheck({ projectKey: PROJECT, signingSecret: SECRET, fetch: signedFetch, now })!;
  const pathFor = (aud: string) =>
    `/api/integrator/revocations?project_key=${encodeURIComponent(PROJECT)}&aud=${encodeURIComponent(aud)}`;
  const tok = (over: Record<string, unknown> = {}) => ({ ...session(), aud: SITE, rh: "rh-site", ...over });

  beforeEach(() => {
    seen = [];
    lists = {
      [SITE]: { v: 1, at: nowSec(), tokens: [], accounts: {}, handles: {} },
      [WWW]: { v: 1, at: nowSec(), tokens: [], accounts: {}, handles: {} },
    };
  });

  it("asks for the token's own audience, signed over method, path and aud", async () => {
    await integrator().status(tok());
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`https://me.ochk.io${pathFor(SITE)}`);
    const t = nowSec();
    const mac = createHmac("sha256", SECRET).update(`${t}.GET ${pathFor(SITE)}`).digest("hex");
    expect(seen[0]!.headers.get("x-oc-signature")).toBe(`t=${t},v1=${mac}`);
    expect(seen[0]!.headers.get("authorization")).toBeNull();
  });

  it("sends the token's aud exactly as it is, never normalised", async () => {
    await integrator().status(tok({ aud: "https://Site.example" }));
    expect(seen[0]!.url).toBe(`https://me.ochk.io${pathFor("https://Site.example")}`);
  });

  it("refuses a session whose handle the list ends, and keeps one minted after the cutoff", async () => {
    lists[SITE]!.handles = { "rh-site": nowSec() - 60 };
    const check = integrator();
    expect(await check.refuses(tok({ iat: nowSec() - 3600 }), "GET")).toBe(true);
    expect(await check.refuses(tok({ iat: nowSec() - 30 }), "POST")).toBe(false);
    expect(await check.refuses(tok({ iat: undefined }), "GET")).toBe(true);
  });

  it("refuses ended sessions from each origin of one site, with one check", async () => {
    lists[SITE]!.handles = { "rh-site": nowSec() + 1 };
    lists[WWW]!.handles = { "rh-www": nowSec() + 1 };
    const check = integrator();
    expect(await check.refuses(tok(), "GET")).toBe(true);
    expect(await check.refuses(tok({ aud: WWW, rh: "rh-www" }), "GET")).toBe(true);
    expect(new Set(seen.map((x) => new URL(x.url).searchParams.get("aud")))).toEqual(new Set([SITE, WWW]));
  });

  it("checks a token with no handle by its signature alone, and never fetches for it", async () => {
    lists[SITE]!.handles = { "rh-site": nowSec() + 1 };
    const check = integrator();
    expect(await check.status(tok({ rh: undefined }))).toBe("live");
    expect(await check.refuses(tok({ rh: undefined }), "POST")).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("never answers live for a handle without one string aud, and never fetches for it", async () => {
    const check = integrator();
    for (const over of [{ aud: [SITE] }, { aud: [SITE, WWW] }, { aud: undefined }, { aud: "" }, { rh: 42 }, { rh: "" }, { rh: null }]) {
      expect(await check.status(tok(over))).toBe("revoked");
      expect(await check.refuses(tok(over), "GET")).toBe(true);
    }
    expect(seen).toHaveLength(0);
  });

  it("never reads a list without a full handles map as nothing ended", async () => {
    const t = nowSec();
    const bodies = [
      JSON.stringify({ v: 1, at: t, tokens: [], accounts: {} }),
      JSON.stringify({ v: 1, at: t, tokens: [], accounts: {}, handles: null }),
      JSON.stringify({ v: 1, at: t, tokens: [], accounts: {}, handles: ["rh-site"] }),
      JSON.stringify({ v: 1, at: t, tokens: [], accounts: {}, handles: { "rh-site": String(t) } }),
      `{"v":1,"at":${t},"tokens":[],"accounts":{},"handles":{"rh-site":1${"0".repeat(400)}}}`,
    ];
    for (const body of bodies) {
      const c = integratorRevocationCheck({
        projectKey: PROJECT,
        signingSecret: SECRET,
        fetch: (async () => new Response(body)) as unknown as typeof fetch,
        now,
      })!;
      expect(await c.refuses(tok(), "POST"), body.slice(0, 80)).toBe(true);
    }
  });

  it("still refuses a string-aud session whose handle the list ends", async () => {
    lists[SITE]!.handles = { "rh-site": nowSec() + 1 };
    expect(await integrator().refuses(tok(), "GET")).toBe(true);
  });

  it("measures staleness from the list's own time: an old or future-dated list cannot vouch for a write", async () => {
    lists[SITE]!.at = nowSec() - 11 * 60;
    expect(await integrator().refuses(tok(), "POST")).toBe(true);
    expect(await integrator().refuses(tok(), "GET")).toBe(false);
    lists[SITE]!.at = nowSec() + 5 * 60;
    expect(await integrator().refuses(tok(), "POST")).toBe(true);
    lists[SITE]!.at = nowSec() + 30;
    expect(await integrator().refuses(tok(), "POST")).toBe(false);
  });

  it("is null without a project key and secret, so an unconfigured site is never refused", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OC_PROJECT_KEY", "");
    vi.stubEnv("OC_SIGNING_SECRET", "");
    expect(integratorRevocationCheck()).toBeNull();
    vi.stubEnv("OC_PROJECT_KEY", PROJECT);
    expect(integratorRevocationCheck()).toBeNull();
    vi.stubEnv("OC_SIGNING_SECRET", SECRET);
    expect(integratorRevocationCheck()).not.toBeNull();
  });
});
