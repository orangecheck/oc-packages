"""
Unit tests for orangecheck.pledge's agent-delegation §7.3 logic.

Mirrors @orangecheck/pledge-core's src/delegation.test.ts. Two surfaces:
  - parse_pledge_create_scope / check_pledge_create_scope (pure scope-string
    parsing + constraint matching)
  - verify_pledge with delegation_lookup wired in (end-to-end verify path)
"""

from __future__ import annotations

from orangecheck.pledge import (
    DelegationLookupResult,
    check_pledge_create_scope,
    compute_pledge_id,
    parse_pledge_create_scope,
    pledge_input_from_dict,
    verify_pledge,
    wrap_pledge_envelope,
)


def _pledge(opts: dict | None = None) -> dict:
    """Build a wire-form pledge envelope dict for delegation tests."""
    opts = opts or {}
    base = {
        "swearer": "bc1qprincipal",
        "proposition": "p",
        "resolution": {"mechanism": "chain_state", "query": "q"},
        "resolves_at": {"block": 100},
        "expires_at": "2099-01-01T00:00:00Z",
        "bond": {"attestation_id": "0" * 64, "min_sats": 1_000_000, "min_days": 90},
        "counterparty": None,
        "dispute": {"mechanism": None, "params": None},
        "remediation": "breach_recorded",
        "sworn_at": "2026-04-01T00:00:00Z",
        "nonce": "0" * 32,
    }
    base.update({k: v for k, v in opts.items() if k in base})

    canon_input = pledge_input_from_dict(base)
    use_agent = "via_delegation" not in opts or opts["via_delegation"] is not None
    sig_pubkey = "bc1qagent" if use_agent else "bc1qprincipal"
    via_delegation = (
        {"delegation_id": opts.get("via_delegation", "d" * 64), "agent_address": opts.get("agent_address", "bc1qagent")}
        if use_agent
        else None
    )
    env = wrap_pledge_envelope(
        canon_input,
        "AAAA",
        sig_pubkey=sig_pubkey,
        via_delegation=via_delegation,
    )
    # Sanity: id matches.
    assert env["id"] == compute_pledge_id(canon_input)
    return env


def _delegation(opts: dict | None = None) -> DelegationLookupResult:
    opts = opts or {}
    return DelegationLookupResult(
        principal=opts.get("principal", "bc1qprincipal"),
        agent=opts.get("agent", "bc1qagent"),
        scopes=tuple(opts.get("scopes", ("pledge:create",))),
        expires_at=opts.get("expires_at", "2099-01-01T00:00:00Z"),
    )


# ─── parse_pledge_create_scope ────────────────────────────────────────────


def test_parse_bare_scope():
    assert parse_pledge_create_scope("pledge:create") == {}


def test_parse_single_constraint():
    assert parse_pledge_create_scope("pledge:create(max_bond_sats=2000000)") == {
        "max_bond_sats": "2000000"
    }


def test_parse_multiple_constraints():
    assert parse_pledge_create_scope(
        "pledge:create(max_bond_sats=2000000,mechanism=chain_state,counterparty=bc1qcp)"
    ) == {
        "max_bond_sats": "2000000",
        "mechanism": "chain_state",
        "counterparty": "bc1qcp",
    }


def test_parse_returns_none_for_other_scopes():
    assert parse_pledge_create_scope("lock:seal(max_bytes=1024)") is None
    assert parse_pledge_create_scope("stamp:sign") is None


def test_parse_returns_none_for_malformed():
    assert parse_pledge_create_scope("pledge:create(missing_close") is None
    assert parse_pledge_create_scope("pledge:create(no_equals)") is None


# ─── check_pledge_create_scope ────────────────────────────────────────────


def test_check_passes_bare_scope():
    r = check_pledge_create_scope(_pledge(), _delegation({"scopes": ("pledge:create",)}))
    assert r.ok


def test_check_passes_max_bond_sats_within_limit():
    r = check_pledge_create_scope(
        _pledge({"bond": {"attestation_id": "0" * 64, "min_sats": 500_000, "min_days": 30}}),
        _delegation({"scopes": ("pledge:create(max_bond_sats=1000000)",)}),
    )
    assert r.ok


def test_check_fails_max_bond_sats_exceeded():
    r = check_pledge_create_scope(
        _pledge({"bond": {"attestation_id": "0" * 64, "min_sats": 5_000_000, "min_days": 30}}),
        _delegation({"scopes": ("pledge:create(max_bond_sats=1000000)",)}),
    )
    assert not r.ok
    assert r.code == "E_DELEGATION_SCOPE_VIOLATED"
    assert "max_bond_sats" in r.reason


def test_check_fails_mechanism_mismatch():
    r = check_pledge_create_scope(
        _pledge({"resolution": {"mechanism": "http_get_hash", "query": "q"}}),
        _delegation({"scopes": ("pledge:create(mechanism=chain_state)",)}),
    )
    assert not r.ok
    assert "mechanism" in r.reason


def test_check_fails_counterparty_mismatch():
    r = check_pledge_create_scope(
        _pledge({"counterparty": "bc1qOTHER"}),
        _delegation({"scopes": ("pledge:create(counterparty=bc1qexpected)",)}),
    )
    assert not r.ok
    assert "counterparty" in r.reason


def test_check_searches_multiple_scopes():
    r = check_pledge_create_scope(
        _pledge(),
        _delegation(
            {
                "scopes": (
                    "lock:seal(max_bytes=1024)",
                    "pledge:create(max_bond_sats=2000000)",
                    "stamp:sign",
                )
            }
        ),
    )
    assert r.ok


def test_check_no_pledge_create_scope():
    r = check_pledge_create_scope(
        _pledge(),
        _delegation({"scopes": ("lock:seal", "stamp:sign")}),
    )
    assert not r.ok
    assert r.code == "E_DELEGATION_SCOPE_VIOLATED"


# ─── verify_pledge with delegation_lookup ─────────────────────────────────


def test_verify_passes_with_delegation():
    r = verify_pledge(
        _pledge(),
        skip_signature_verification=True,
        delegation_lookup=lambda _id, _now: _delegation(),
    )
    assert r.ok


def test_verify_e_delegation_not_found_when_lookup_returns_none():
    r = verify_pledge(
        _pledge(),
        skip_signature_verification=True,
        delegation_lookup=lambda _id, _now: None,
    )
    assert not r.ok
    assert r.code == "E_DELEGATION_NOT_FOUND"


def test_verify_principal_mismatch():
    r = verify_pledge(
        _pledge(),
        skip_signature_verification=True,
        delegation_lookup=lambda _id, _now: _delegation({"principal": "bc1qOTHER"}),
    )
    assert not r.ok
    assert r.code == "E_DELEGATION_SCOPE_VIOLATED"


def test_verify_agent_mismatch():
    r = verify_pledge(
        _pledge(),
        skip_signature_verification=True,
        delegation_lookup=lambda _id, _now: _delegation({"agent": "bc1qOTHER"}),
    )
    assert not r.ok
    assert r.code == "E_DELEGATION_SCOPE_VIOLATED"


def test_verify_expired_delegation():
    r = verify_pledge(
        _pledge({"sworn_at": "2026-04-01T00:00:00Z"}),
        skip_signature_verification=True,
        delegation_lookup=lambda _id, _now: _delegation({"expires_at": "2026-03-01T00:00:00Z"}),
    )
    assert not r.ok
    assert r.code == "E_DELEGATION_EXPIRED"


def test_verify_skips_when_no_lookup_supplied():
    # Back-compat: agent-delegated envelope verifies at shape + sig layer
    # without the §7.3 1–5 chain when no lookup is provided.
    r = verify_pledge(_pledge(), skip_signature_verification=True)
    assert r.ok


def test_verify_non_agent_pledge_does_not_call_lookup():
    def boom(_id: str, _now: str):
        raise AssertionError("delegation_lookup should not be called for non-agent pledges")

    r = verify_pledge(
        _pledge({"via_delegation": None}),
        skip_signature_verification=True,
        delegation_lookup=boom,
    )
    assert r.ok


def test_verify_rejects_async_lookup_with_clear_error():
    async def async_lookup(_id: str, _now: str):
        return _delegation()

    r = verify_pledge(
        _pledge(),
        skip_signature_verification=True,
        delegation_lookup=async_lookup,
    )
    assert not r.ok
    assert r.code == "E_DELEGATION_NOT_FOUND"
    assert "awaitable" in r.message.lower()
