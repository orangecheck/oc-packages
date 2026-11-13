import { describe, expect, it } from "vitest";

import { isOnOwnerList, ownerListEntries } from "../index";

const OWNER = "did:oc:" + "a".repeat(32);
const BTC = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

describe("ownerListEntries", () => {
  it("splits on commas, trims each entry and drops empty ones", () => {
    expect(ownerListEntries(` ${OWNER} ,, ${BTC},\n`)).toEqual([OWNER, BTC]);
  });

  it("reads an unset or empty list as no entries", () => {
    for (const raw of [undefined, null, "", " , ,"]) expect(ownerListEntries(raw)).toEqual([]);
  });
});

describe("isOnOwnerList", () => {
  const list = `${OWNER}, ${BTC}`;

  it("admits an exact entry, padded or not", () => {
    expect(isOnOwnerList(OWNER, list)).toBe(true);
    expect(isOnOwnerList(` ${BTC} `, list)).toBe(true);
  });

  it("refuses another identity, a different case and a part of an entry", () => {
    expect(isOnOwnerList("did:oc:" + "b".repeat(32), list)).toBe(false);
    expect(isOnOwnerList(OWNER.toUpperCase(), list)).toBe(false);
    expect(isOnOwnerList(OWNER.slice(0, 20), list)).toBe(false);
    expect(isOnOwnerList(`${OWNER},${BTC}`, list)).toBe(false);
  });

  it("never admits no id or a blank one, even against a list with a blank entry", () => {
    for (const id of [undefined, null, "", "   "]) {
      expect(isOnOwnerList(id, list)).toBe(false);
      expect(isOnOwnerList(id, `${OWNER},,  ,`)).toBe(false);
    }
  });

  it("admits no one when the list is unset", () => {
    expect(isOnOwnerList(OWNER, undefined)).toBe(false);
    expect(isOnOwnerList(OWNER, "")).toBe(false);
  });
});
