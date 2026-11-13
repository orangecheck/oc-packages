// The family's owner list, OWNER_OC_ADDRESSES, read one way everywhere. It
// mixes did:oc values and Bitcoin addresses, because sites compare different
// things; pass the raw value in, so this reads no environment of its own.

/** The list's entries: split on commas, each trimmed, empty ones dropped. */
export function ownerListEntries(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Is `id` on the owner list `raw`? An exact match on a trimmed entry, case
 * included. No id, or a blank one, is never on it, whatever the list holds.
 */
export function isOnOwnerList(id: string | null | undefined, raw: string | null | undefined): boolean {
  const wanted = id?.trim();
  return !!wanted && ownerListEntries(raw).includes(wanted);
}
