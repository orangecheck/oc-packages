"""Exception hierarchy for the OrangeCheck Python SDK."""

from __future__ import annotations


class OrangeCheckError(Exception):
    """Base class for every error raised by this SDK."""

    def __init__(self, message: str, *, status: int | None = None, body: object | None = None):
        super().__init__(message)
        self.status = status
        self.body = body


class RateLimitError(OrangeCheckError):
    """Returned by the hosted API when the caller hits its rate limit."""


class VerificationError(OrangeCheckError):
    """Raised by verify_challenge when the signature or nonce doesn't match."""
