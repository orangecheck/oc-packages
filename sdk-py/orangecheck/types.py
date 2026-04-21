"""Typed data classes for the OrangeCheck Python SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass(frozen=True)
class IdentityBinding:
    """A self-asserted handle bound to a Bitcoin address."""

    protocol: str
    identifier: str


@dataclass(frozen=True)
class CheckResult:
    """The shape returned by :func:`check`."""

    ok: bool
    sats: int
    days: int
    score: float
    attestation_id: str | None = None
    address: str | None = None
    identities: tuple[IdentityBinding, ...] = field(default_factory=tuple)
    network: Literal["mainnet", "testnet", "signet"] | None = None
    reasons: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> "CheckResult":
        ids = tuple(
            IdentityBinding(protocol=i["protocol"], identifier=i["identifier"])
            for i in d.get("identities") or []
        )
        return cls(
            ok=bool(d["ok"]),
            sats=int(d.get("sats", 0)),
            days=int(d.get("days", 0)),
            score=float(d.get("score", 0)),
            attestation_id=d.get("attestation_id"),
            address=d.get("address"),
            identities=ids,
            network=d.get("network"),
            reasons=tuple(d.get("reasons") or ()),
        )


@dataclass(frozen=True)
class VerifyOutcome:
    """The shape returned by :func:`verify`."""

    ok: bool
    codes: tuple[str, ...]
    network: Literal["mainnet", "testnet", "signet"]
    attestation_id: str | None = None
    identities: tuple[IdentityBinding, ...] = field(default_factory=tuple)
    sats_bonded: int | None = None
    days_unspent: int | None = None
    score: float | None = None

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> "VerifyOutcome":
        metrics = d.get("metrics") or {}
        ids = tuple(
            IdentityBinding(protocol=i["protocol"], identifier=i["identifier"])
            for i in d.get("identities") or []
        )
        return cls(
            ok=bool(d["ok"]),
            codes=tuple(d.get("codes") or ()),
            network=d.get("network", "mainnet"),
            attestation_id=d.get("attestation_id"),
            identities=ids,
            sats_bonded=metrics.get("sats_bonded"),
            days_unspent=metrics.get("days_unspent"),
            score=metrics.get("score"),
        )


@dataclass(frozen=True)
class AttestationSummary:
    """A single entry from a :func:`discover` response."""

    attestation_id: str
    address: str
    scheme: str
    identities: tuple[IdentityBinding, ...]
    issued_at: str
    expires_at: str | None = None
    verification_url: str | None = None
    relay_hints: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> "AttestationSummary":
        ids = tuple(
            IdentityBinding(protocol=i["protocol"], identifier=i["identifier"])
            for i in d.get("identities") or []
        )
        return cls(
            attestation_id=d["attestation_id"],
            address=d["address"],
            scheme=d.get("scheme", "bip322"),
            identities=ids,
            issued_at=d.get("issued_at", ""),
            expires_at=d.get("expires_at"),
            verification_url=d.get("verification_url"),
            relay_hints=tuple(d.get("relay_hints") or ()),
        )


@dataclass(frozen=True)
class DiscoverResult:
    """The shape returned by :func:`discover`."""

    count: int
    total: int
    attestations: tuple[AttestationSummary, ...]

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> "DiscoverResult":
        return cls(
            count=int(d.get("count", 0)),
            total=int(d.get("total", 0)),
            attestations=tuple(
                AttestationSummary.from_json(a) for a in d.get("attestations") or ()
            ),
        )


@dataclass(frozen=True)
class Challenge:
    """Response shape from ``GET /api/challenge``."""

    message: str
    nonce: str
    expires_at: int
    expires_at_iso: str

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> "Challenge":
        return cls(
            message=d["message"],
            nonce=d["nonce"],
            expires_at=int(d["expiresAt"]),
            expires_at_iso=d.get("expiresAtIso", ""),
        )


@dataclass(frozen=True)
class ChallengeVerified:
    """Successful response shape from ``POST /api/challenge``."""

    address: str
    nonce: str
    expires_at: int
    audience: str | None = None
    purpose: str | None = None

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> "ChallengeVerified":
        return cls(
            address=d["address"],
            nonce=d["nonce"],
            expires_at=int(d["expiresAt"]),
            audience=d.get("audience"),
            purpose=d.get("purpose"),
        )
