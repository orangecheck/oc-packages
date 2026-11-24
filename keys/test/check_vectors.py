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


def holder(address, lookup, named_binding=None):
    """The key-holder state from records whose signatures are taken as given (README section 5)."""
    recs = {}
    for r in lookup["records"]:
        head, f = fields(r["envelope"]["record"])
        if f.get("address") != address:
            continue
        i = rid(r["envelope"]["record"])
        prev = recs.get(i)
        recs[i] = (head, f, r.get("anchoredAt", prev[2] if prev else None))
    bindings = [(i, f, a) for i, (h, f, a) in recs.items() if h == "oc-attest-key:binding:v1"]
    takeovers = [(i, f, a) for i, (h, f, a) in recs.items() if h == "oc-attest-key:takeover:v1"]
    retires = [(i, f, a) for i, (h, f, a) in recs.items() if h == "oc-attest-key:retire:v1"]
    if not bindings:
        if named_binding:
            return {"status": "refused"}
        return {"status": "unbound"} if lookup["complete"] else {"status": "refused"}
    assert len(bindings) == 1 and len(takeovers) <= 1 and len(retires) <= 1
    bid, b, _ = bindings[0]
    state = {"status": "bound", "born": b["key_holder"], "holder": b["key_holder"], "binding": bid}
    t = takeovers[0] if takeovers else None
    r = retires[0] if retires else None
    for x in (t, r):
        assert x is None or x[1]["binding"] == bid
    if t and r and r[2] is not None and r[2] <= int(t[1]["since_height"]):
        return {"status": "refused"}
    if t:
        state.update(holder="user", takeover=t[0], takeover_since=int(t[1]["since_height"]))
        if t[2] is not None:
            state["takeover_anchored_at"] = t[2]
    elif r:
        state.update(holder="retired", retire=r[0], retire_reason=r[1]["reason"])
    return state


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
                elif c["expected"]["reason"] == "bundle_address_mismatch":
                    wa = bytes.fromhex(by_id["kd01"]["input"]["wallet_secret"])
                    assert c["input"]["phrase"] == by_id["kd01"]["expected"]["wallet"]["mnemonic"]
                    plain = open_copy(c["input"]["copy"], hkdf(wa, b"oc-keys/v1 phrase kek"))
                    assert plain is not None and len(plain) == 32, v["id"]
                checked += 1
        elif cat == "record":
            for c in v.get("cases", [v]):
                if c["expected"].get("ok"):
                    text = c["input"]["envelope"]["record"]
                    assert canonical_text(text), v["id"]
                    assert rid(text) == c["expected"]["id"], v["id"]
                    assert fields(text)[0] == f"oc-attest-key:{c['expected']['type']}:v1", v["id"]
                    checked += 1
        elif cat == "issuers":
            exp = v["expected"]
            if exp.get("ok") and len(exp["terms"]) > 1:
                (r,) = v["input"]["records"]
                head, f = fields(r["envelope"]["record"])
                old, new = exp["terms"]
                assert head == "oc-attest-key:issuer:v1" and (f["old"], f["new"]) == (old["address"], new["address"])
                assert old["until"] == {"since": int(f["since_height"]), "anchoredAt": r["anchoredAt"]}
                assert new["from"] == int(f["since_height"]), v["id"]
                checked += 1
        elif cat == "key_holder":
            for c in v.get("cases", [v]):
                exp = c["expected"]
                if exp["status"] == "bound":
                    # Only the records whose issuer, signatures and since block the vectors call good.
                    good = {"complete": True, "records": [r for r in c["input"]["lookup"]["records"] if rid(r["envelope"]["record"]) in {exp["binding"], exp.get("takeover"), exp.get("retire")}]}
                    assert holder(c["input"]["address"], good) == exp, (v["id"], c.get("name"))
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
                else:
                    want = [["d", f"oc-attest-key:{f['address']}:{rid(c['input'])}"], ["t", f["address"]], ["t", "oc-attest-key"]]
                assert c["expected"] == want, (v["id"], c["name"])
                checked += 1
    print(f"keys-v1: {checked} checks passed in Python")


if __name__ == "__main__":
    main(sys.argv[1])
