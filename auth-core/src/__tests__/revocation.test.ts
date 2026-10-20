import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetFamilyRevocationCheckForTests,
  createRevocationCheck,
  familyRevocationCheck,
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
