"""Read a popup token with the published orangecheck package, as an integrator does.

stdin: {"token", "audience", "jwks"}. stdout: the package version and what
verify_session and check_oc_session returned, as JSON. Run with python -I.
"""

import dataclasses
import json
import sys

import os

import orangecheck
from orangecheck import InvalidSession, check_oc_session, verify_session

if os.environ.get("COMPAT_HOLLOW") == "1":
    # mutants.mjs: both readers answer nothing, and every test must then fail.
    def verify_session(*_a, **_k):
        return None

    def check_oc_session(*_a, **_k):
        return None


def plain(v):
    if dataclasses.is_dataclass(v):
        return {f.name: plain(getattr(v, f.name)) for f in dataclasses.fields(v)}
    if isinstance(v, (list, tuple)):
        return [plain(x) for x in v]
    if isinstance(v, dict):
        return {k: plain(x) for k, x in v.items()}
    return v


def main():
    req = json.load(sys.stdin)
    out = {"version": orangecheck.__version__}
    try:
        out["session"] = plain(verify_session(req["token"], req["audience"], jwks=req["jwks"]))
    except InvalidSession as err:
        out["refused"] = err.reason
    out["check"] = plain(check_oc_session(req["token"], req["audience"], jwks=req["jwks"]))
    json.dump(out, sys.stdout)


main()
