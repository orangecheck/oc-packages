"""``python -m orangecheck`` — a tiny CLI, mostly for quick sanity checks.

Prefer the TypeScript ``oc`` CLI (``npm install -g @orangecheck/cli``) for
day-to-day use — it has more features. This one is here so Python users
can smoke-test the package after ``pip install``.
"""

from __future__ import annotations

import argparse
import json
import sys

from . import __version__, check


def main() -> int:
    parser = argparse.ArgumentParser(prog="orangecheck", description="OrangeCheck Python SDK")
    parser.add_argument("--version", action="version", version=f"orangecheck {__version__}")

    sub = parser.add_subparsers(dest="cmd")

    c = sub.add_parser("check", help="Gate on an OrangeCheck proof")
    c.add_argument("--addr")
    c.add_argument("--id")
    c.add_argument("--identity")
    c.add_argument("--min-sats", type=int, default=0)
    c.add_argument("--min-days", type=int, default=0)
    c.add_argument("--base-url", default=None)

    args = parser.parse_args()

    if args.cmd == "check":
        result = check(
            addr=args.addr,
            id=args.id,
            identity=args.identity,
            min_sats=args.min_sats,
            min_days=args.min_days,
            base_url=args.base_url,
        )
        json.dump(
            {
                "ok": result.ok,
                "sats": result.sats,
                "days": result.days,
                "score": result.score,
                "attestation_id": result.attestation_id,
                "address": result.address,
                "identities": [
                    {"protocol": i.protocol, "identifier": i.identifier}
                    for i in result.identities
                ],
                "network": result.network,
                "reasons": list(result.reasons),
            },
            sys.stdout,
            indent=2,
        )
        sys.stdout.write("\n")
        return 0 if result.ok else 2

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
