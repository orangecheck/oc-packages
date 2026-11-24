"""A second implementation of the parts of keys-v1.json that need no curve
math: the PRF salt, both key-encryption keys, every lock's additional data and
ciphertext, every open, the record ids and the Fedimint root. Written from the
README's description against Python's standard library and `cryptography`,
not from the TypeScript.

    python3 -I keys/test/check_vectors.py keys/test-vectors/keys-v1.json
"""

import base64
import hashlib
import hmac
import json
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


def bip39_seed(mnemonic):
    m = unicodedata.normalize("NFKD", mnemonic).encode()
    return hashlib.pbkdf2_hmac("sha512", m, b"mnemonic", 2048)


def open_copy(copy, key):
    try:
        return AESGCM(key).decrypt(b64u(copy["nonce"]), b64u(copy["ciphertext"]), aad(copy))
    except InvalidTag:
        return None


def main(path):
    d = json.load(open(path))
    checked = 0
    assert d["constants"]["prf_salt"] == hashlib.sha256(b"oc-keys/v1 prf").hexdigest()
    by_id = {v["id"]: v for v in d["vectors"]}
    for v in d["vectors"]:
        cat = v["category"]
        if cat == "derivation":
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
                    rid = hashlib.sha256(c["input"]["record"].encode()).hexdigest()
                    assert rid == c["expected"]["id"], v["id"]
                    checked += 1
        elif cat == "custody":
            for r in v["input"]["records"]:
                text = r["record"]
                assert text.endswith("\n") and not text.endswith("\n\n") and "\r" not in text
            exp = v["expected"]
            if exp.get("ok"):
                ids = {hashlib.sha256(r["record"].encode()).hexdigest() for r in v["input"]["records"]}
                assert exp["binding"] in ids, v["id"]
                if "takeover" in exp:
                    assert exp["takeover"] in ids
                    t = next(r for r in v["input"]["records"] if r["record"].startswith("oc-keys:takeover:v1\n"))
                    assert f"binding: {exp['binding']}\n" in t["record"]
            checked += 1
    print(f"keys-v1: {checked} checks passed in Python")


if __name__ == "__main__":
    main(sys.argv[1])
