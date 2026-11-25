"""A second implementation of the parts of keys-v1.json that need no curve
math: the PRF salt, both recovery phrases, both key-encryption keys, every
lock's additional data and ciphertext, every open, the record texts and ids,
the publication tags, and the key-holder rule over records whose signatures
it takes as given. Written from the README's description against Python's
standard library and `cryptography`, not from the TypeScript.

    python3 -I keys/test/check_vectors.py keys/test-vectors/keys-v1.json
"""

import base64
import hashlib
import hmac
import json
import os
import sys
import unicodedata

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def b64u(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hkdf(ikm, info):
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=info).derive(ikm)


def aad(copy):
    lines = ["oc-keys:lock:v1", f"method: {copy['method']}", f"did_oc: {copy['did_oc']}"]
    if copy["method"] == "passkey":
        lines.append(f"credential_id: {copy['credential_id']}")
    lines.append(f"address: {copy['address']}")
    return ("\n".join(lines) + "\n").encode()


# The BIP-39 English list, pinned to the hash of bitcoin/bips bip-0039/english.txt.
WORDLIST_SHA256 = "2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda"


def wordlist():
    raw = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "bip39-english.txt"), "rb").read()
    assert hashlib.sha256(raw).hexdigest() == WORDLIST_SHA256, "bip39-english.txt is not the BIP-39 list"
    words = raw.decode().split("\n")[:-1]
    assert len(words) == 2048
    return words


def bip39_phrase(entropy, words):
    bits = len(entropy) * 8
    n = (int.from_bytes(entropy, "big") << (bits // 32)) | (hashlib.sha256(entropy).digest()[0] >> (8 - bits // 32))
    count = (bits + bits // 32) // 11
    return " ".join(words[(n >> (11 * (count - 1 - i))) & 0x7FF] for i in range(count))


def bip39_entropy(phrase, words, count=24):
    """The entropy a phrase of `count` words encodes, or None: a bad word, count or checksum."""
    ws = phrase.split(" ")
    if len(ws) != count or any(w not in words for w in ws):
        return None
    cs = count * 11 // 33
    e = (sum(words.index(w) << (11 * (count - 1 - i)) for i, w in enumerate(ws)) >> cs).to_bytes(count * 4 // 3, "big")
    return e if bip39_phrase(e, words) == phrase else None


def bip39_seed(mnemonic):
    m = unicodedata.normalize("NFKD", mnemonic).encode()
    return hashlib.pbkdf2_hmac("sha512", m, b"mnemonic", 2048)


def open_copy(copy, key):
    try:
        return AESGCM(key).decrypt(b64u(copy["nonce"]), b64u(copy["ciphertext"]), aad(copy))
    except InvalidTag:
        return None


def canonical_text(t):
    return t.endswith("\n") and not t.endswith("\n\n") and "\r" not in t and all(32 <= ord(c) < 127 for c in t[:-1].replace("\n", " "))


def fields(text):
    lines = text[:-1].split("\n")
    return lines[0], dict(line.split(": ", 1) for line in lines[1:])


def rid(text):
    return hashlib.sha256(text.encode()).hexdigest()


def earliest(a, b):
    return a if b is None else b if a is None else min(a, b)


RETIRE = "oc-attest-key:retire:v1"


def holder(address, lookup, named_binding=None):
    """The key-holder state from records whose signatures are taken as given (README section 4)."""
    # A record the read missed could refuse what the rest allow.
    if not lookup["complete"]:
        return {"status": "refused"}
    recs = {}
    for r in lookup["records"]:
        env = r["envelope"]
        head, f = fields(env["record"])
        if f.get("address") != address:
            continue
        # A binding or takeover counts only with the address's own two signatures beside the issuer's.
        if head != RETIRE and not {"address_sig", "nostr_sig"} <= set(env):
            continue
        i = rid(env["record"])
        prev = recs.get(i)
        recs[i] = (head, f, earliest(prev[2] if prev else None, r.get("anchoredAt")))
    bindings = [(i, f, a) for i, (h, f, a) in recs.items() if h == "oc-attest-key:binding:v1"]
    takeovers = [(i, f, a) for i, (h, f, a) in recs.items() if h == "oc-attest-key:takeover:v1"]
    retires = [(i, f, a) for i, (h, f, a) in recs.items() if h == RETIRE]
    if not bindings:
        if named_binding or takeovers:
            return {"status": "refused"}
        return {"status": "unbound"}
    assert len(bindings) == 1 and len(takeovers) <= 1
    bid, b, _ = bindings[0]
    state = {"status": "bound", "born": b["key_holder"], "holder": b["key_holder"], "binding": bid}
    t = takeovers[0] if takeovers else None
    assert t is None or t[1]["binding"] == bid
    # A retire counts only against the custodial binding it names; after a takeover, only if anchored before it could be made.
    rs = [x for x in retires if x[1]["binding"] == bid and b["key_holder"] == "orangecheck"]
    if t:
        if any(a is not None and a <= int(t[1]["since_height"]) for _, _, a in rs):
            return {"status": "refused"}
        rs = []
    assert len(rs) <= 1
    r = rs[0] if rs else None
    if t:
        state.update(holder="user", takeover=t[0], takeover_since=int(t[1]["since_height"]))
        if t[2] is not None:
            state["takeover_anchored_at"] = t[2]
    elif r:
        state.update(holder="retired", retire=r[0], retire_reason=r[1]["reason"])
    return state


def looks_good(env, headers):
    """A retire as far as this checker can see one: canonical, the issuer's signature only, its since block on the chain."""
    head, f = fields(env["record"])
    return (
        head == RETIRE
        and canonical_text(env["record"])
        and set(env) - {"ots"} == {"record", "issuer_sig"}
        and headers.get(f["since_height"]) == f["since_block"]
    )


def noise_by_shape(env):
    """A binding or takeover without the address's own signatures: noise whoever signed it."""
    head, _ = fields(env["record"])
    return head != RETIRE and not {"address_sig", "nostr_sig"} <= set(env)


def judge(state, ev):
    """The signature rule (README section 5), from the state alone."""
    if state["status"] == "refused":
        return {"accept": False, "reason": "unresolved"}
    if state["status"] == "unbound":
        return {"accept": True, "reason": "unbound"}
    a, m, live = ev.get("anchoredAt"), ev.get("madeAfter"), ev.get("live")
    if any(h is not None and (not isinstance(h, int) or h < 0) for h in (a, m)) or (a is not None and m is not None and m >= a):
        return {"accept": False, "reason": "bad_evidence"}
    if state["holder"] == "retired":
        return {"accept": False, "reason": "retired"}
    if state["holder"] == "orangecheck":
        return {"accept": False, "reason": "orangecheck_held"}
    if state["born"] == "user":
        return {"accept": True, "reason": "user_born"}
    if a is not None and a <= state["takeover_since"]:
        return {"accept": False, "reason": "before_takeover"}
    if live is True:
        return {"accept": True, "reason": "after_takeover"}
    if m is not None and "takeover_anchored_at" in state and m >= state["takeover_anchored_at"]:
        return {"accept": True, "reason": "after_takeover"}
    return {"accept": True, "reason": "ambiguous_window"}


def wallet_link(wallet, lookup, at=None):
    """Which identity a wallet's coins count for (README section 6), signatures taken as given."""
    if not lookup["complete"]:
        return {"status": "refused", "reason": "unavailable"}
    links, unlinks = {}, {}
    for r in lookup["records"]:
        env = r["envelope"]
        head, f = fields(env["record"])
        kind = {"oc-attest-key:wallet-link:v1": links, "oc-attest-key:wallet-unlink:v1": unlinks}.get(head)
        if kind is None or f["wallet"] != wallet:
            continue
        i = rid(env["record"])
        prev = kind.get(i)
        kind[i] = (f, earliest(prev[1] if prev else None, r.get("anchoredAt")), (prev[2] if prev else False) or "wallet_sig" in env)
    ends = {}
    for f, a, by_wallet in unlinks.values():
        l = links.get(f["link"])
        if l and (l[0]["did_oc"], l[0]["address"]) == (f["did_oc"], f["address"]):
            ends.setdefault(f["link"], []).append(a)
        elif by_wallet:
            return {"status": "refused", "reason": "unlink_without_link"}

    def ended(i, h):
        return any(u is not None and u <= h for u in ends.get(i, []))

    counted = sorted((a, i) for i, (f, a, _) in links.items() if a is not None and (at is None or a <= at))
    cur = None
    for h in sorted({a for a, _ in counted}):
        if cur and ended(cur, h):
            cur = None
        if cur:
            continue
        starting = [i for a, i in counted if a == h and not ended(i, h)]
        if len(starting) == 1:
            cur = starting[0]
    if cur is None or (ends.get(cur) if at is None else ended(cur, at)):
        return {"status": "none"}
    f, a, _ = links[cur]
    return {"status": "linked", "address": f["address"], "link": cur, "anchored_at": a, "_f": f}


def judge_link(address, identity, identity_lookup, link, wallet):
    """Whether the wallet's coins count for the address (README section 6), from the three states."""
    no = lambda reason: {"accept": False, "reason": reason}
    if "refused" in (link["status"], identity["status"], wallet["status"]):
        return no("unresolved")
    if link["status"] == "none":
        return no("not_linked")
    f = link["_f"]
    if f["address"] != address:
        return no("linked_elsewhere")
    if identity["status"] == "unbound":
        return no("unresolved")
    binding = next(fields(r["envelope"]["record"])[1] for r in identity_lookup["records"] if rid(r["envelope"]["record"]) == identity["binding"])
    if (binding["did_oc"], identity["binding"]) != (f["did_oc"], f["binding"]):
        return no("link_mismatch")
    if "takeover_since" in identity and int(f["since_height"]) < identity["takeover_since"]:
        return no("before_takeover")
    ev = {"anchoredAt": link["anchored_at"], "madeAfter": int(f["since_height"])}
    j = judge(identity, ev)
    if not j["accept"]:
        return no(j["reason"])
    if not judge(wallet, ev)["accept"]:
        return no("wallet_key_refused")
    return {"accept": True, "reason": "linked"}


def main(path):
    d = json.load(open(path))
    checked = 0
    words = wordlist()
    assert d["constants"]["prf_salt"] == hashlib.sha256(b"oc-keys/v1 prf").hexdigest()
    by_id = {v["id"]: v for v in d["vectors"]}
    for v in d["vectors"]:
        cat = v["category"]
        if cat == "derivation":
            # Each phrase is the BIP-39 encoding of its 32-byte secret.
            i = bytes.fromhex(v["input"]["identity_secret"])
            w = bytes.fromhex(v["input"]["wallet_secret"])
            assert bip39_phrase(i, words) == v["expected"]["identity"]["mnemonic"], v["id"]
            assert bip39_phrase(w, words) == v["expected"]["wallet"]["mnemonic"], v["id"]
            seed = bip39_seed(v["expected"]["wallet"]["mnemonic"])
            root = hmac.new(b"Fedimint Client Salt", seed, hashlib.sha512).digest()
            assert root.hex() == v["expected"]["wallet"]["fedimint_root_prk"], v["id"]
            checked += 1
        elif cat in ("lock", "lock_phrase"):
            e = v["expected"]
            copy = e["copy"]
            assert aad(copy).decode() == e["aad"], v["id"]
            if cat == "lock":
                kek = hkdf(bytes.fromhex(v["input"]["prf_output"]), b"oc-keys/v1 passkey kek")
                want = bytes.fromhex(v["input"]["identity_secret"] + v["input"]["wallet_secret"])
            else:
                kek = hkdf(bytes.fromhex(v["input"]["wallet_secret"]), b"oc-keys/v1 phrase kek")
                want = bytes.fromhex(v["input"]["identity_secret"])
            assert kek.hex() == e["kek"], v["id"]
            sealed = AESGCM(kek).encrypt(b64u(v["input"]["nonce"]), want, aad(copy))
            assert sealed == b64u(copy["ciphertext"]), v["id"]
            assert open_copy(copy, kek) == want, v["id"]
            checked += 1
        elif cat == "open":
            for c in v.get("cases", [v]):
                kek = hkdf(bytes.fromhex(c["input"]["prf_output"]), b"oc-keys/v1 passkey kek")
                plain = open_copy(c["input"]["copy"], kek)
                if c["expected"]["reason"] == "lock_open_failed":
                    assert plain is None, (v["id"], c.get("name"))
                else:  # bundle_address_mismatch: it opens; the address check is the curve's
                    assert plain is not None and len(plain) == 64, v["id"]
                checked += 1
        elif cat == "open_phrase":
            for c in v["cases"]:
                if c["expected"]["reason"] == "lock_open_failed":
                    # B's phrase: W_B, from kd02, which is the wallet behind that phrase.
                    wb = bytes.fromhex(by_id["kd02"]["input"]["wallet_secret"])
                    assert c["input"]["phrase"] == by_id["kd02"]["expected"]["wallet"]["mnemonic"]
                    assert open_copy(c["input"]["copy"], hkdf(wb, b"oc-keys/v1 phrase kek")) is None
                elif c["expected"]["reason"] == "phrase_invalid":
                    # Not the BIP-39 encoding of 32 bytes; a valid 12-word phrase is refused for its length.
                    phrase = c["input"]["phrase"]
                    assert bip39_entropy(phrase, words) is None, (v["id"], c.get("name"))
                    if len(phrase.split(" ")) == 12:
                        assert bip39_entropy(phrase, words, 12) is not None, (v["id"], "a valid 12-word phrase")
                elif c["expected"]["reason"] == "bundle_address_mismatch":
                    wa = bytes.fromhex(by_id["kd01"]["input"]["wallet_secret"])
                    assert c["input"]["phrase"] == by_id["kd01"]["expected"]["wallet"]["mnemonic"]
                    plain = open_copy(c["input"]["copy"], hkdf(wa, b"oc-keys/v1 phrase kek"))
                    assert plain is not None and len(plain) == 32, v["id"]
                checked += 1
        elif cat == "record":
            for c in v.get("cases", [v]):
                if c["expected"].get("ok"):
                    env = c["input"]["envelope"]
                    text = env["record"]
                    assert canonical_text(text), v["id"]
                    assert rid(text) == c["expected"]["id"], v["id"]
                    assert fields(text)[0] == f"oc-attest-key:{c['expected']['type']}:v1", v["id"]
                    # Every binding and takeover carries the address's two signatures; a retire, the issuer's only.
                    own = c["expected"]["type"] != "retire"
                    assert set(env) - {"ots"} == {"record", "issuer_sig"} | ({"address_sig", "nostr_sig"} if own else set()), v["id"]
                    assert c["expected"]["signed"] == {"issuer": True, "address": own}, v["id"]
                    checked += 1
        elif cat == "wallet_record":
            for c in v.get("cases", [v]):
                if c["expected"].get("ok"):
                    text = c["input"]["envelope"]["record"]
                    head, f = fields(text)
                    assert canonical_text(text) and rid(text) == c["expected"]["id"], v["id"]
                    assert head == f"oc-attest-key:{c['expected']['type']}:v1" and f["wallet"] != f["address"], v["id"]
                    # Which signatures travel; whether they verify is BIP-322's, which this checker takes as given.
                    assert {k: f"{k}_sig" in c["input"]["envelope"] for k in ("address", "wallet")} == c["expected"]["signed"], v["id"]
                    checked += 1
        elif cat == "wallet_link":
            # Every record here carries good signatures and a good since block; wallet_link_copies needs a BIP-322 verifier.
            for c in v.get("cases", [v]):
                i = c["input"]
                link = wallet_link(i["wallet"], i["wallet_records"], i.get("at"))
                ident = holder(i["address"], i["address_records"])
                verdict = judge_link(i["address"], ident, i["address_records"], link, holder(i["wallet"], i["wallet_records"]))
                summary = {k: x for k, x in link.items() if k != "_f"}
                assert {"link": summary, "verdict": verdict} == c["expected"], (v["id"], c.get("name"))
                checked += 1
        elif cat == "issuers":
            for c in v.get("cases", [v]):
                exp, recs = c["expected"], c["input"]["records"]
                if exp.get("ok") and len(exp["terms"]) > 1:
                    old, new = exp["terms"]
                    # Only records into or out of a term's address are on the walk; any other is ignored, whatever is wrong with it.
                    on = [r for r in recs if {fields(r["envelope"]["record"])[1][k] for k in ("old", "new")} & {old["address"], new["address"]}]
                    assert len({rid(r["envelope"]["record"]) for r in on}) == 1, (v["id"], c.get("name"))
                    head, f = fields(on[0]["envelope"]["record"])
                    assert head == "oc-attest-key:issuer:v1" and (f["old"], f["new"]) == (old["address"], new["address"])
                    # Copies of one record: the earliest anchor counts.
                    first = min(r["anchoredAt"] for r in on if "anchoredAt" in r)
                    assert old["until"] == {"since": int(f["since_height"]), "anchoredAt": first}
                    assert new["from"] == int(f["since_height"]), v["id"]
                    checked += 1
                elif exp == {"ok": False, "reason": "issuer_record_unverified"}:
                    # A record into or out of the named issuer whose since block is not this chain's.
                    named, headers = c["input"]["named"], d["chain"]["headers"]
                    heads = [fields(r["envelope"]["record"])[1] for r in recs]
                    assert any(named in (f["old"], f["new"]) and headers.get(f["since_height"]) != f["since_block"] for f in heads), v["id"]
                    checked += 1
                elif exp == {"ok": False, "reason": "bad_anchor"}:
                    # One copy on the walk anchored at or below its since block refuses, whatever the other copies carry.
                    assert any("anchoredAt" in r and r["anchoredAt"] <= int(fields(r["envelope"]["record"])[1]["since_height"]) for r in recs), (v["id"], c.get("name"))
                    checked += 1
        elif cat == "key_holder":
            headers = d["chain"]["headers"]
            for c in v.get("cases", [v]):
                exp = c["expected"]
                records = c["input"]["lookup"]["records"]
                if not c["input"]["lookup"]["complete"]:
                    # Short of the floor nothing resolves, whatever the read found.
                    assert exp == {"status": "refused", "reason": "unavailable"}, (v["id"], c.get("name"))
                    checked += 1
                elif exp["status"] == "bound":
                    # The records the vectors call good, and every retire that looks good here: a retire it ignores must change nothing.
                    ids = {exp["binding"], exp.get("takeover"), exp.get("retire")}
                    good = {"complete": True, "records": [r for r in records if rid(r["envelope"]["record"]) in ids or looks_good(r["envelope"], headers)]}
                    assert holder(c["input"]["address"], good) == exp, (v["id"], c.get("name"))
                    checked += 1
                elif exp["status"] == "unbound" and all(noise_by_shape(r["envelope"]) or looks_good(r["envelope"], headers) for r in records):
                    assert holder(c["input"]["address"], c["input"]["lookup"]) == exp, (v["id"], c.get("name"))
                    checked += 1
        elif cat == "signature":
            state = holder(v["input"]["address"], v["input"]["lookup"])
            for c in v["cases"]:
                assert judge(state, c["evidence"]) == c["expected"], (v["id"], c["evidence"])
                checked += 1
        elif cat == "publication":
            for c in v["cases"]:
                head, f = fields(c["input"])
                if head == "oc-attest-key:issuer:v1":
                    want = [["d", f"oc-attest-key:issuer:{rid(c['input'])}"], ["t", "oc-attest-key-issuer"]]
                elif head.startswith("oc-attest-key:wallet-"):
                    want = [["d", f"oc-attest-key:{f['wallet']}:{rid(c['input'])}"], ["t", f"oc-attest-key:{f['wallet']}"], ["t", f"oc-attest-key:{f['address']}"], ["t", "oc-attest-key"]]
                else:
                    want = [["d", f"oc-attest-key:{f['address']}:{rid(c['input'])}"], ["t", f"oc-attest-key:{f['address']}"], ["t", "oc-attest-key"]]
                assert c["expected"] == want, (v["id"], c["name"])
                checked += 1
        elif cat == "publication_no_bare_address":
            # Against kn01's tags for the same record: none is a bare address the record names.
            tags = {rid(c["input"]): c["expected"] for c in next(x for x in d["vectors"] if x["id"] == "kn01")["cases"]}
            for c in v["cases"]:
                _, f = fields(c["input"])
                names = {f[k] for k in ("address", "wallet", "old", "new") if k in f}
                bare = [t for t in tags[rid(c["input"])] if t[0] == "t" and t[1] in names]
                assert bare == [] and c["expected"] == {"bare_address_tags": []}, v["id"]
                checked += 1
    print(f"keys-v1: {checked} checks passed in Python")


if __name__ == "__main__":
    main(sys.argv[1])
