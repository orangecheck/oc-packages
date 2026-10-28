// Channels (oc-chat-protocol SPEC §8.3) — the pure, offline-verifiable core.
//
// v1 = PUBLIC channels: a kind-30110 founder-rooted governance descriptor +
// kind-30111 `chat-channel` posts + a Bitcoin-priced write gate. Private
// channels (read:"members" + an encryption block + kind-30113 group keys) are
// reserved behind the SAME descriptor (§8.3.7) and are NOT implemented here —
// the v1 verifier rejects them as unsupported, never silently downgrades.
//
// A public channel makes NO E2EE claim (S-CH-4): it uses OC Lock *identity
// binding* (BIP-322 device signatures via the kind-30078 record) + OC Chat's
// *Bitcoin-priced access control*, not confidentiality. Posts are plaintext,
// recipient-less (`recipients=[]` → E_CHANNEL_RECIPIENTS otherwise), and
// content-addressed.
//
// Bitcoin-load-bearing axis (§8.3.3): ONLY `utxo-floor` (rooted:true) carries
// the Bitcoin claim — a funded, aged UTXO has no Ed25519 analog, so spam is
// priced in Bitcoin maturity. allowlist / founder / open are rooted:false (NOT
// Bitcoin-load-bearing; rendered the muted "via ochk.io" tier). The
// `write.rooted` flag MUST match the policy (E_CH_POLICY_INVALID), making the
// Bitcoin claim a property of the artifact, not a UI label.
//

// Every read a verdict needs (bindings, liveness, the chain, BIP-322) is passed
// in, so the same rules run in a browser, a relay's write gate or a terminal.

import { sha256 } from '@noble/hashes/sha256';
import { hexEncode, utf8Encode } from '@orangecheck/lock-crypto';

import { isValidAttachment, type Attachment } from './attachment';
import { b64urlNoPad, canonicalBytes } from './canonical';
import { signedBy, verifyNostrEvent, type NostrEvent } from './event';
import { answeredEvents, UnansweredReadError, type Query, type VerifyBip322 } from './read';
import type { AuthHostKey } from './session';
import {
    hasBindingTag,
    readVersionBinding,
    type Liveness,
    type VersionBinding,
} from './version-binding';

export const CHANNEL_DESCRIPTOR_KIND = 30110;
export const CHANNEL_POST_KIND = 30111;

const CH_DTAG_PREFIX = 'oc-lock-chat-ch:';
const POST_DTAG_PREFIX = 'oc-lock-chat-msg:';
const CH_SALT_LABEL = 'oc-lock-chat-ch/v1:';

/** Slug: a NON-authoritative display label (S17). The trust root is the founder
 *  address, never the slug. */
const SLUG_RE = /^[a-z0-9-]{3,48}$/;

/** Wire-error + client-capability codes (§8.3 / §9). The first six are normative
 *  protocol errors; `E_CH_UNSUPPORTED` is a v1-client capability signal (a
 *  private-channel descriptor a public-only client can't render). */
export type ChannelError =
    | 'E_CHANNEL_RECIPIENTS'
    | 'E_CH_POLICY_INVALID'
    | 'E_CH_UNAUTHORIZED'
    | 'E_CH_WRITE_DENIED'
    | 'E_CH_NOT_WRITER'
    | 'E_CHAN_FLOOR'
    | 'E_CH_CLOSED'
    | 'E_CH_UNSUPPORTED';

// ───────────────────────── types ─────────────────────────

/** Is this inbox key bound to this principal (a Bitcoin address or a did:oc) by a
 *  kind-30078 record? A reader that could not tell should throw, not answer false. */
export type IsBound = (pubkey: string, principal: string) => Promise<boolean>;

/** Does this utxo-floor write proof match current chain state: an unspent output
 *  of `address` with exactly the proof's value, height and block hash (§8.3.3)? */
export type VerifyOnChain = (proof: WriteProof, address: string) => Promise<boolean>;

export type WritePolicy = 'utxo-floor' | 'allowlist' | 'founder' | 'open';

export interface ChannelWrite {
    policy: WritePolicy;
    /** utxo-floor: minimum UTXO age (blocks) the write-proof must clear. */
    utxo_floor_confs: number;
    /** utxo-floor: minimum UTXO value (sats) counting toward the age test. */
    utxo_floor_sats: number;
    /** allowlist: hex SHA-256 of the canonical sorted writer-address list. */
    allowlist_root: string | null;
    /** MUST be true iff policy === 'utxo-floor' (§8.3.3). */
    rooted: boolean;
}

/** kind-30110 descriptor content (the hashed bytes; the binding sig + signer
 *  ride in the event tags, NOT in here). */
export interface DescriptorContent {
    v: 1;
    channel_id: string;
    slug: string;
    founder_address: string;
    founder_inbox_pubkey: string;
    read: 'public'; // v1 (private "members" reserved, §8.3.7)
    encryption: null; // v1 (reserved private block)
    write: ChannelWrite;
    admins: string[];
    moderators: string[];
    title: string;
    description: string;
    avatar: string | null;
    rules: string | null;
    directory_opt_in: boolean;
    created_at: number;
    supersedes: string | null;
    /** §8.3.8 lifecycle. OMITTED when active (byte-compat with pre-close
     *  descriptors + vc14/vc15); present as "closed" when the founder retires the
     *  channel. A closed channel is read-only (only removal tombstones land);
     *  re-openable via a later status:"active" founder revision. Only the FOUNDER
     *  may change status (verifyDescriptor), so an admin cannot close via a coup. */
    status?: 'active' | 'closed';
    /** §8.3.8 optional pointer to a replacement channel a closed channel succeeds
     *  to. A user-confirmed link, never an auto-redirect. */
    successor_channel_id?: string | null;
}

/** Self-contained, height-anchored UTXO write-proof (§8.3.3). Verified OFFLINE
 *  against the reader's own tip — no per-post live point-query. `control_sig`
 *  (BIP-322 over post_id) is NOT in this hashed struct; it rides the event. */
export interface WriteProof {
    outpoint: string;
    value_sats: number;
    anchor_block_height: number;
    anchor_block_hash: string;
}

/** kind-30111 `chat-channel` post content (the hashed bytes). A removal
 *  tombstone (§8.3.5) is a post with `removes` = target post_id, written with `body:""`. */
export interface PostContent {
    v: 1;
    kind: 'chat-channel';
    channel_id: string;
    author_address: string;
    author_inbox_pubkey: string;
    body: string;
    seq: number;
    parent_id: string | null;
    /** REQUIRED iff the channel's write.policy === 'utxo-floor'. */
    write_proof?: WriteProof;
    /** Moderation tombstone: the target post_id this removes (§8.3.5). */
    removes?: string;
    /** Optional PUBLIC inline file attachment (§8.3.2). UNLIKE a DM attachment it
     *  is NOT encrypted — a public channel post is plaintext, so the file is
     *  public too. It rides base64 in the content and is committed to post_id
     *  (tamper-evident), size-bounded to MAX_ATTACHMENT_BYTES. */
    attachment?: Attachment;
}

export type Role = 'founder' | 'admin' | 'moderator' | 'member';

/** channel_id = SHA-256('oc-lock-chat-ch/v1:' ‖ founder_address ‖ ':' ‖ slug)
 *  — identity binds to the founder address, the trust root (vc14, §8.3.1). */
export function channelId(founderAddress: string, slug: string): string {
    return hexEncode(sha256(utf8Encode(CH_SALT_LABEL + founderAddress + ':' + slug.toLowerCase())));
}

/** The pre-0.3.0 descriptor d-tag, "oc-lock-chat-ch:" ‖ b64url(SHA-256(salt ‖ channel_id)).
 *  Readers still fetch it; nothing is published at it any more (§8.3.1). */
export function descriptorDtag(cid: string): string {
    return CH_DTAG_PREFIX + b64urlNoPad(sha256(utf8Encode(CH_SALT_LABEL + cid)));
}

/** A descriptor version's own d-tag, "oc-lock-chat-ch:" ‖ descriptor_id (0.3.0). */
export function versionDtag(did: string): string {
    return CH_DTAG_PREFIX + did;
}

/** Post d-tag = "oc-lock-chat-msg:" ‖ b64url(SHA-256(channel_id ‖ ":" ‖ post_id)). */
export function postDtag(cid: string, pid: string): string {
    return POST_DTAG_PREFIX + b64urlNoPad(sha256(utf8Encode(cid + ':' + pid)));
}

export function isValidSlug(slug: string): boolean {
    return SLUG_RE.test(slug);
}

/** descriptor_id = SHA-256(canonical(content)), hex (content-addressed, vc14). */
export function descriptorId(content: DescriptorContent): string {
    return hexEncode(sha256(canonicalBytes(content)));
}

/** post_id = SHA-256(canonical(content)), hex (content-addressed, vc16). */
export function postId(content: PostContent): string {
    return hexEncode(sha256(canonicalBytes(content)));
}

/** allowlist_root = hex SHA-256(canonical(sorted unique writer-address list)). */
export function allowlistRoot(addresses: string[]): string {
    const sorted = [...new Set(addresses)].sort();
    return hexEncode(sha256(canonicalBytes(sorted)));
}

// ─────────────────────── policy / roles ───────────────────────

/** §8.3.3: utxo-floor ⇒ rooted:true; allowlist/founder/open ⇒ rooted:false.
 *  A mismatch is E_CH_POLICY_INVALID — the Bitcoin claim is a property of the
 *  artifact, not a UI label. */
export function policyRootedMatches(write: ChannelWrite): boolean {
    return write.rooted === (write.policy === 'utxo-floor');
}

/** Is a write policy Bitcoin-load-bearing (passes the Ed25519 substitution
 *  test)? Only utxo-floor in v1 (pay-to-post is the deferred kind-30115 one). */
export function isRootedPolicy(policy: WritePolicy): boolean {
    return policy === 'utxo-floor';
}

export function roleOf(address: string, d: DescriptorContent): Role {
    if (address === d.founder_address) return 'founder';
    if (d.admins.includes(address)) return 'admin';
    if (d.moderators.includes(address)) return 'moderator';
    return 'member';
}

/**
 * The badge the roster shows. A founder lists admins and moderators without
 * their say, so one who has never posted here reads as named by the founder,
/** Rough address-shape guard: a utxo-floor author MUST post under a Bitcoin
 *  address (a did:oc can't own a UTXO). The BIP-322 control_sig is the real
 *  check; this only rejects an obviously non-Bitcoin principal early. */
export function isBitcoinAddress(addr: string): boolean {
    if (/^(bc1|tb1|bcrt1)[02-9ac-hj-np-z]{6,}$/i.test(addr)) return true; // bech32(m)
    if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,39}$/.test(addr)) return true; // base58 p2pkh/p2sh
    return false;
}

// ─────────────────── write-proof arithmetic (vc17) ───────────────────

export interface WriteProofVerdict {
    /** Age of the anchored UTXO at the reader's tip: tip − anchor + 1. */
    ageConfs: number;
    meetsAge: boolean;
    meetsValue: boolean;
    verdict: 'accept' | 'E_CHAN_FLOOR';
}

/**
 * Evaluate a height-anchored UTXO write-proof OFFLINE against the reader's own
 * current tip (one tip read per render batch, never per post). Pure arithmetic
 * — reproduces vc17. The control_sig (BIP-322 over post_id) is verified
 * separately in checkWritePermission; this only gates value + age.
 */
export function evaluateWriteProof(
    proof: Pick<WriteProof, 'value_sats' | 'anchor_block_height'>,
    policy: Pick<ChannelWrite, 'utxo_floor_confs' | 'utxo_floor_sats'>,
    tipHeight: number
): WriteProofVerdict {
    const ageConfs = tipHeight - proof.anchor_block_height + 1;
    const meetsAge = ageConfs >= policy.utxo_floor_confs;
    const meetsValue = proof.value_sats >= policy.utxo_floor_sats;
    return {
        ageConfs,
        meetsAge,
        meetsValue,
        verdict: meetsAge && meetsValue ? 'accept' : 'E_CHAN_FLOOR',
    };
}


export function parseDescriptor(ev: NostrEvent): DescriptorContent | null {
    try {
        const c = JSON.parse(ev.content) as Record<string, unknown>;
        if (c.v !== 1) return null;
        if (typeof c.channel_id !== 'string' || typeof c.slug !== 'string') return null;
        if (typeof c.founder_address !== 'string') return null;
        if (typeof c.founder_inbox_pubkey !== 'string') return null;
        if (!c.write || typeof c.write !== 'object') return null;
        if (typeof c.created_at !== 'number') return null;
        // Text every reader shows; not text is not a descriptor (§8.3.1).
        if (typeof c.title !== 'string' || typeof c.description !== 'string') return null;
        return c as unknown as DescriptorContent;
    } catch {
        return null;
    }
}

export function parsePost(ev: NostrEvent): PostContent | null {
    try {
        const c = JSON.parse(ev.content) as Record<string, unknown>;
        if (c.v !== 1 || c.kind !== 'chat-channel') return null;
        if (typeof c.channel_id !== 'string' || typeof c.author_address !== 'string') return null;
        if (typeof c.author_inbox_pubkey !== 'string' || typeof c.body !== 'string') return null;
        // A malformed/oversized attachment is a render-DoS — drop the whole post
        // (the attachment is committed to post_id, so it can't be stripped).
        if (c.attachment !== undefined && !isValidAttachment(c.attachment)) return null;
        return c as unknown as PostContent;
    } catch {
        return null;
    }
}


// ───────────────────────── verify ─────────────────────────

export type DescriptorVerify =
    | { ok: true; channelId: string; descriptorId: string; signerAddress: string }
    | { ok: false; error: ChannelError };

/**
 * Verify a channel descriptor (§8.3.1) OFFLINE given the descriptor content + its
 * kind-30110 event. Authorship = the event's schnorr signature by an inbox key
 * that is bound (kind-30078) to the founder (genesis) or a PRIOR-epoch admin
 * (supersede) — the governance hash-chain, the §5 parent_id trick applied to
 * governance (vc15). No per-edit wallet ceremony: the device record IS the
 * binding, established once. The Bitcoin claim is in the write policy, not here.
 *
 * v1 rejects private descriptors (read != "public" or encryption != null) as
 * E_CH_UNSUPPORTED — a public-only client never silently downgrades them.
 */
export async function verifyDescriptor(
    content: DescriptorContent,
    event: NostrEvent,
    opts: {
        priorEpoch?: DescriptorContent;
        /** Is this inbox key bound to this principal (an address or a did:oc)? */
        isBound: IsBound;
    }
): Promise<DescriptorVerify> {
    const isBound = opts.isBound;

    // Phase guard: v1 is public-only.
    if (content.read !== 'public' || content.encryption !== null) {
        return { ok: false, error: 'E_CH_UNSUPPORTED' };
    }
    // Capability guard: the public-only v1 client does not implement allowlist
    // membership proofs (§8.3.3), so it cannot resolve the writer set on read —
    // every post would then fail-closed and silently vanish. Reject the descriptor
    // as unsupported instead, so the unsupported state is honest rather than a
    // channel that renders permanently empty with no error.
    if (content.write.policy === 'allowlist') {
        return { ok: false, error: 'E_CH_UNSUPPORTED' };
    }
    // Identity integrity: channel_id MUST bind to founder_address ‖ slug.
    if (channelId(content.founder_address, content.slug) !== content.channel_id) {
        return { ok: false, error: 'E_CH_UNAUTHORIZED' };
    }
    // Policy/rooted match (the Bitcoin claim is a property of the artifact).
    if (!policyRootedMatches(content.write)) {
        return { ok: false, error: 'E_CH_POLICY_INVALID' };
    }
    // The event must be self-consistent + schnorr-signed by its own pubkey, and
    // actually carry this content (its content hashes to descriptor_id).
    if (!signedBy(event, event.pubkey)) return { ok: false, error: 'E_CH_UNAUTHORIZED' };
    if (event.content !== JSON.stringify(content)) {
        // Allow a re-serialization match (key order may differ on the wire); the
        // content-addressed id is canonical, so compare on descriptorId instead.
        if (descriptorId(parseDescriptor(event) ?? content) !== descriptorId(content)) {
            return { ok: false, error: 'E_CH_UNAUTHORIZED' };
        }
    }

    const did = descriptorId(content);

    if (!opts.priorEpoch) {
        // Genesis: supersedes MUST be null; the signing inbox key IS the founder's
        // and is bound to founder_address via the kind-30078 record.
        if (content.supersedes !== null) return { ok: false, error: 'E_CH_UNAUTHORIZED' };
        if (event.pubkey !== content.founder_inbox_pubkey) {
            return { ok: false, error: 'E_CH_UNAUTHORIZED' };
        }
        if (!(await isBound(event.pubkey, content.founder_address))) {
            return { ok: false, error: 'E_CH_UNAUTHORIZED' };
        }
        return {
            ok: true,
            channelId: content.channel_id,
            descriptorId: did,
            signerAddress: content.founder_address,
        };
    }

    const prior = opts.priorEpoch;
    // Same channel, and the chain links to the prior descriptor_id.
    if (content.channel_id !== prior.channel_id) return { ok: false, error: 'E_CH_UNAUTHORIZED' };
    if (content.supersedes !== descriptorId(prior)) {
        return { ok: false, error: 'E_CH_UNAUTHORIZED' };
    }
    // The inbox TRUST-ROOT key is immutable across epochs (founder_address is
    // already pinned by channel_id at line 465). A supersede that mutates
    // founder_inbox_pubkey — e.g. an admin redirecting the channel's trust root to
    // their own device key — is unauthorized.
    if (content.founder_inbox_pubkey !== prior.founder_inbox_pubkey) {
        return { ok: false, error: 'E_CH_UNAUTHORIZED' };
    }
    // The FOUNDER is the trust root (§8.3.4: "may do anything, including replace the
    // descriptor") — a founder-signed supersede may make any change.
    if (await isBound(event.pubkey, prior.founder_address)) {
        return {
            ok: true,
            channelId: content.channel_id,
            descriptorId: did,
            signerAddress: prior.founder_address,
        };
    }
    // An ADMIN-signed supersede may edit metadata/policy but MUST NOT stage a
    // governance coup: it cannot remove the founder or any prior admin (require
    // prior.admins ⊆ next.admins), and it cannot CLOSE or RE-OPEN the channel
    // (§8.3.8 status change is founder-only — an admin nuking a channel others
    // rely on is exactly the coup we forbid). Only the founder may do either, and
    // only the founder may set or change successor_channel_id, at any status.
    for (const addr of prior.admins) {
        if (await isBound(event.pubkey, addr)) {
            const nextAdmins = new Set(content.admins);
            if (!prior.admins.every((a) => nextAdmins.has(a))) {
                return { ok: false, error: 'E_CH_UNAUTHORIZED' };
            }
            if ((prior.status ?? 'active') !== (content.status ?? 'active')) {
                return { ok: false, error: 'E_CH_UNAUTHORIZED' };
            }
            if ((prior.successor_channel_id ?? null) !== (content.successor_channel_id ?? null)) {
                return { ok: false, error: 'E_CH_UNAUTHORIZED' };
            }
            return {
                ok: true,
                channelId: content.channel_id,
                descriptorId: did,
                signerAddress: addr,
            };
        }
    }
    return { ok: false, error: 'E_CH_UNAUTHORIZED' };
}

export interface VerifyPostOpts {
    /** Reader's current tip height (one read per render batch). */
    tipHeight: number;
    /** BIP-322 by author_address over post_id — REQUIRED for utxo-floor. */
    controlSig?: string;
    /** The full writer-address list for an allowlist channel (membership proof). */
    allowlist?: string[];
    /** The Nostr event (to verify the author device signature). verifyPost
     *  rejects a post without it; checkWritePolicy does not read it. */
    event?: NostrEvent;
    /** Is this inbox key bound to this principal? verifyPost needs it. */
    isBound?: IsBound;
    /** BIP-322, for a utxo-floor post's control_sig. */
    verifyBip322: VerifyBip322;
    /** A non-empty recipients[] on a chat-channel envelope is E_CHANNEL_RECIPIENTS. */
    recipients?: unknown[];
    /** utxo-floor: binds the write_proof to real chain state (io.ts has one
     *  over an esplora API). Fail-closed: false drops the post. */
    verifyOnChain: VerifyOnChain;
}

export type PostVerify =
    | { ok: true; postId: string; role: Role; isTombstone: boolean }
    | { ok: false; error: ChannelError };

/**
 * NON-AUTHORITATIVE policy check (§8.3.2/§8.3.3): recipient-exclusion, channel
 * match, writer role, and the write-policy gate — ASSUMING the author is already
 * authenticated. It does NOT verify the author device signature or the kind-30078
 * binding. `verifyPost` wraps this with that authentication; this is exposed only
 * so the write-gate arithmetic (vc17) can be unit-tested without minting a real
 * device record. Never call it as an authorization decision on its own.
 */
export async function checkWritePolicy(
    content: PostContent,
    descriptor: DescriptorContent,
    opts: VerifyPostOpts
): Promise<PostVerify> {
    const verify = opts.verifyBip322;

    // (0) recipient-exclusion: a chat-channel post is public + recipient-less.
    if (opts.recipients && opts.recipients.length > 0) {
        return { ok: false, error: 'E_CHANNEL_RECIPIENTS' };
    }
    // A non-channel envelope kind is not a valid channel post (distinct from the
    // recipient-exclusion condition — they are different defects).
    if (content.kind !== 'chat-channel') return { ok: false, error: 'E_CH_WRITE_DENIED' };
    if (content.channel_id !== descriptor.channel_id) {
        return { ok: false, error: 'E_CH_WRITE_DENIED' };
    }

    const pid = postId(content);
    const role = roleOf(content.author_address, descriptor);
    // A removal names its target in `removes`; its body grants nothing (§8.3.5).
    const isTombstone = typeof content.removes === 'string';

    // Moderation tombstone: roster moderator/admin/founder only (§8.3.5).
    if (isTombstone) {
        if (role === 'member') return { ok: false, error: 'E_CH_UNAUTHORIZED' };
        return { ok: true, postId: pid, role, isTombstone: true };
    }

    // §8.3.8: a CLOSED channel is read-only. Removal tombstones (above) still land
    // so moderation works after close; every other post is denied. Forward-
    // effective only — posts already propagated are unaffected.
    if ((descriptor.status ?? 'active') === 'closed') {
        return { ok: false, error: 'E_CH_CLOSED' };
    }

    const denied = await checkWritePermission(content, descriptor, role, pid, opts, verify);
    if (denied) return { ok: false, error: denied };
    return { ok: true, postId: pid, role, isTombstone: false };
}

/**
 * AUTHORITATIVE verify of a public channel post (§8.3.2). REQUIRES the kind-30111
 * event so it can prove authorship — there is no unauthenticated accept path:
 * (0) recipient-exclusion; (1) the event schnorr-signed by author_inbox_pubkey
 * AND that inbox key bound to author_address via the kind-30078 record; (2)/(3)
 * the §8.3.3 write-policy gate + writer role (via checkWritePolicy). A post with
 * no event cannot be authenticated and is rejected E_CH_UNAUTHORIZED.
 */
export async function verifyPost(
    content: PostContent,
    descriptor: DescriptorContent,
    opts: VerifyPostOpts
): Promise<PostVerify> {
    const isBound = opts.isBound;

    // (0) recipient-exclusion is structural — check before authentication so a
    // recipient-bearing post returns the precise code, not E_CH_UNAUTHORIZED.
    if (opts.recipients && opts.recipients.length > 0) {
        return { ok: false, error: 'E_CHANNEL_RECIPIENTS' };
    }
    // (1) authorship is MANDATORY: no event ⇒ unauthenticated ⇒ reject.
    if (!opts.event || !isBound) return { ok: false, error: 'E_CH_UNAUTHORIZED' };
    if (!signedBy(opts.event, content.author_inbox_pubkey)) {
        return { ok: false, error: 'E_CH_UNAUTHORIZED' };
    }
    if (!(await isBound(content.author_inbox_pubkey, content.author_address))) {
        return { ok: false, error: 'E_CH_UNAUTHORIZED' };
    }
    return checkWritePolicy(content, descriptor, opts);
}

/** The §8.3.3 write gate. founder/admin bypass all policies (the trust root). */
async function checkWritePermission(
    content: PostContent,
    descriptor: DescriptorContent,
    role: Role,
    pid: string,
    opts: VerifyPostOpts,
    verify: VerifyBip322
): Promise<ChannelError | null> {
    if (role === 'founder' || role === 'admin') return null;
    const w = descriptor.write;
    switch (w.policy) {
        case 'founder':
            return 'E_CH_NOT_WRITER'; // only founder/admin (handled above)
        case 'open':
            return null; // any valid device may post
        case 'allowlist': {
            if (!opts.allowlist) return 'E_CH_WRITE_DENIED';
            if (allowlistRoot(opts.allowlist) !== w.allowlist_root) {
                return 'E_CH_WRITE_DENIED';
            }
            return opts.allowlist.includes(content.author_address) ? null : 'E_CH_WRITE_DENIED';
        }
        case 'utxo-floor': {
            if (!content.write_proof) return 'E_CHAN_FLOOR';
            if (!opts.controlSig) return 'E_CHAN_FLOOR';
            if (!isBitcoinAddress(content.author_address)) return 'E_CHAN_FLOOR';
            // Cheap offline gates first (no network): the floor arithmetic + the
            // control_sig (author controls the address, over post_id).
            const v = evaluateWriteProof(content.write_proof, w, opts.tipHeight);
            if (v.verdict !== 'accept') return 'E_CHAN_FLOOR';
            const sigOk = await verify({
                address: content.author_address,
                message: pid,
                signature: opts.controlSig,
            });
            if (sigOk !== true) return 'E_CHAN_FLOOR';
            // THE Bitcoin-load-bearing leg: bind the proof to real chain state — the
            // claimed coin must actually exist, be unspent, be owned by the author's
            // address, and carry the asserted value/height/hash. Without this the
            // value/age are unverified author claims (the §8.3.3 forgery). Fail-closed.
            if ((await opts.verifyOnChain(content.write_proof, content.author_address)) !== true) {
                return 'E_CHAN_FLOOR';
            }
            return null;
        }
    }
}

// ───────────────────── the governance chain ─────────────────────

/** A version of a channel the resolution authorized (§8.3.1). */
export interface ResolvedVersion {
    descriptorId: string;
    descriptor: DescriptorContent;
    /** The keys of its authorized copies, the founder's first. */
    signers: string[];
    /** The event ids of its authorized copies. A copy of the same content under any
     *  other key or event is not one: the id covers the content, not the signer. */
    copies: string[];
}

export interface ResolvedChannel {
    descriptor: DescriptorContent;
    descriptorId: string;
    /** How many governance epochs validated back to genesis (1 = genesis only). */
    epochs: number;
    /** The key that signed the copy of the tip the channel resolved by. */
    tipPubkey: string;
    /** The resolved chain from the genesis to the tip, with every key that signed
     *  an authorized copy of each version, and those copies' event ids. */
    chain: ResolvedVersion[];
    /** Every authorized version, on any branch, with every key that signed a copy. */
    versions: ResolvedVersion[];
    /** Every closed tip, overruled ones included: a re-open supersedes each (§8.3.8). */
    closedTips: { descriptorId: string; descriptor: DescriptorContent }[];
}

/** What a resolver needs beyond the events themselves. */
export interface ChainReads {
    /** A pre-0.3.0 version (no `binding` tag): is its key bound to the principal now? */
    isBound: IsBound;
    /** Every key the auth host publishes, retired ones included (§8.6). Read once, when a session record needs them. */
    hostKeys: () => Promise<readonly AuthHostKey[]>;
    /** Is a version's binding still live: no revocation of it seen on any relay,
     *  and an address bind not dated ahead of the reader's clock? 'unknown' (no
     *  relay answered) stops the resolution with UnansweredReadError; a liveness
     *  read may also throw its own error. */
    liveness: (b: VersionBinding) => Promise<Liveness>;
    verifyBip322: VerifyBip322;
}

/** An authorized copy of a version: whether the founder signed it, and its binding
 *  (null for a pre-0.3.0 copy, authorized by a binding read from the relays). */
interface AuthorizedCopy {
    ev: NostrEvent;
    founder: boolean;
    binding: VersionBinding | null;
}

/**
 * Walk the governance hash-chain over every version of a channel and return the
 * tip that resolves (§8.3.1). A version with a later version after it stands on
 * the binding its event carries; the last version of a chain also needs that
 * binding to be live, else the chain ends at the version before it. Competing
 * tips: a founder-signed branch at a fork wins, then a closed tip, then the
 * longest chain, then the freshest signed created_at, then the lowest
 * descriptor_id. Null if nothing resolves; UnansweredReadError if a liveness
 * read could not be answered.
 */
export async function resolveChannelChain(
    events: NostrEvent[],
    cid: string,
    opts: ChainReads
): Promise<ResolvedChannel | null> {
    // Index descriptors by their own descriptor_id, keeping EVERY event that
    // carries it. Authorship is the event's key, which sits outside the id, so
    // anyone can re-sign a descriptor under their own key: keeping one copy let
    // a stranger's unauthorized copy replace the founder's and roll the channel
    // back. A descriptor stands if any copy is authorized (§8.3.1).
    const nodes = new Map<string, { content: DescriptorContent; events: NostrEvent[] }>();
    for (const ev of events) {
        const content = parseDescriptor(ev);
        if (!content) continue;
        // The d-tag is a relay-side lookup key, not a trust boundary: another
        // founder's valid channel published under this d-tag must not compete.
        if (content.channel_id !== cid) continue;
        if (!signedBy(ev, ev.pubkey)) continue;
        const id = descriptorId(content);
        const node = nodes.get(id);
        if (!node) nodes.set(id, { content, events: [ev] });
        else if (!node.events.some((e) => e.id === ev.id)) node.events.push(ev);
    }
    if (nodes.size === 0) return null;

    let keys: Promise<readonly AuthHostKey[]> | null = null;
    const hostKeys = () => (keys ??= opts.hostKeys());
    const bindings = new Map<string, Promise<VersionBinding | null>>();
    const bindingOf = (ev: NostrEvent) => {
        if (!bindings.has(ev.id))
            bindings.set(ev.id, readVersionBinding(ev, { hostKeys, verifyBip322: opts.verifyBip322 }));
        return bindings.get(ev.id)!;
    };

    // Every authorized copy of a version, the founder's first. A version with a
    // `binding` tag is signed by the principal its record names; one without
    // (pre-0.3.0) only by a key a record on the relays binds now.
    const authorize = async (
        node: { content: DescriptorContent; events: NostrEvent[] },
        priorEpoch?: DescriptorContent
    ): Promise<AuthorizedCopy[]> => {
        const out: AuthorizedCopy[] = [];
        for (const ev of node.events) {
            const binding = await bindingOf(ev);
            const isBound = hasBindingTag(ev)
                ? async (pk: string, principal: string) =>
                      binding !== null && pk === binding.pubkey && principal === binding.principal
                : opts.isBound;
            const v = await verifyDescriptor(node.content, ev, {
                ...(priorEpoch ? { priorEpoch } : {}),
                isBound,
            });
            if (!v.ok) continue;
            const founder = !priorEpoch || v.signerAddress === priorEpoch.founder_address;
            out.push({ ev, founder, binding });
        }
        return out.sort((a, b) => Number(b.founder) - Number(a.founder));
    };

    // Validate each version's chain back to a genesis; memoize its depth.
    const copies = new Map<string, AuthorizedCopy[]>();
    const depthCache = new Map<string, number | null>();
    const validateChain = async (id: string, seen: Set<string>): Promise<number | null> => {
        if (depthCache.has(id)) return depthCache.get(id)!;
        const node = nodes.get(id);
        if (!node || seen.has(id)) {
            depthCache.set(id, null);
            return null;
        }
        seen.add(id);
        const prevId = node.content.supersedes;
        let priorDepth = 0;
        let prior: DescriptorContent | undefined;
        if (prevId !== null) {
            const p = nodes.get(prevId);
            const d = p ? await validateChain(prevId, seen) : null;
            if (!p || d === null) {
                depthCache.set(id, null);
                return null;
            }
            priorDepth = d;
            prior = p.content;
        }
        const a = await authorize(node, prior);
        if (a.length) copies.set(id, a);
        const depth = a.length ? priorDepth + 1 : null;
        depthCache.set(id, depth);
        return depth;
    };
    for (const id of nodes.keys()) await validateChain(id, new Set());

    // The copy a version counts by as the last of its chain: an authorized copy
    // whose binding is live, the founder's first. A pre-0.3.0 copy was authorized
    // by a binding read just now, so it is live by that read.
    const liveness = opts.liveness;
    const liveCache = new Map<string, Promise<Liveness>>();
    const isLive = async (c: AuthorizedCopy): Promise<boolean> => {
        if (!c.binding) return true;
        // Per binding, not per key: the same key under a later vouch can be live
        // while its earlier one is revoked.
        const b = c.binding;
        const key = `${b.principal}:${b.pubkey}:${b.kind === 'session' ? b.issuedAt : b.record.eventId}`;
        if (!liveCache.has(key)) liveCache.set(key, liveness(c.binding));
        const l = await liveCache.get(key)!;
        if (l === 'unknown') throw new UnansweredReadError();
        return l === 'live';
    };
    const tipCopy = async (id: string): Promise<AuthorizedCopy | null> => {
        for (const c of copies.get(id) ?? []) if (await isLive(c)) return c;
        return null;
    };
    const tips = new Map<string, AuthorizedCopy>();
    for (const id of copies.keys()) {
        const c = await tipCopy(id);
        if (c) tips.set(id, c);
    }

    // Only versions on a chain that resolves count at a fork: a revoked key's
    // dead branch must not overrule a live one.
    const resolving = new Set<string>();
    for (const tip of tips.keys()) {
        let cur: string | null = tip;
        while (cur && !resolving.has(cur)) {
            resolving.add(cur);
            cur = nodes.get(cur)?.content.supersedes ?? null;
        }
    }
    // A version's rank at a fork: 1 the founder signed it with a live binding,
    // 2 the founder signed it with a binding since revoked, 3 anything else.
    const rank = new Map<string, number>();
    for (const id of resolving) {
        const founderCopies = (copies.get(id) ?? []).filter((c) => c.founder);
        let r = founderCopies.length ? 2 : 3;
        for (const c of founderCopies) if (await isLive(c)) r = 1;
        rank.set(id, r);
    }

    // Longest chain alone would let an admin fork from a version before the
    // founder's latest decision (e.g. before being removed) and outgrow it, and
    // a stolen founder key, once revoked, outgrow the founder's live device, by
    // a fork or by a genesis of its own. So at a fork, and among geneses, every
    // branch through a version ranked below the best is overruled, however long
    // it grows.
    const overruled = (id: string): boolean => {
        // Siblings at a fork share a parent; the geneses of one channel are
        // siblings under a virtual root (null).
        const beaten = (curId: string, parentId: string | null): boolean => {
            let best = 3;
            for (const [otherId, other] of nodes) {
                if (other.content.supersedes === parentId && resolving.has(otherId)) {
                    best = Math.min(best, rank.get(otherId)!);
                }
            }
            return rank.get(curId)! > best;
        };
        let curId = id;
        for (let cur = nodes.get(id); cur; cur = nodes.get(curId)) {
            const parentId = cur.content.supersedes;
            if (beaten(curId, parentId)) return true;
            if (parentId === null) return false;
            curId = parentId;
        }
        return false;
    };

    const chainTo = (id: string): ResolvedChannel['chain'] => {
        const out: ResolvedChannel['chain'] = [];
        for (let cur: string | null = id; cur; cur = nodes.get(cur)!.content.supersedes) {
            const cs = copies.get(cur) ?? [];
            out.unshift({
                descriptorId: cur,
                descriptor: nodes.get(cur)!.content,
                signers: cs.map((c) => c.ev.pubkey),
                copies: cs.map((c) => c.ev.id),
            });
        }
        return out;
    };

    // Among the tips left (versions nothing supersedes): a closed one, then the
    // longest chain, then the freshest signed created_at, then the lowest
    // descriptor_id, so every reader picks the same tip (§8.3.1, 0.3.2).
    const key = (id: string) => {
        const d = nodes.get(id)!.content;
        return [d.status === 'closed' ? 1 : 0, depthCache.get(id)!, d.created_at] as const;
    };
    const beats = (a: string, b: string): boolean => {
        const ka = key(a);
        const kb = key(b);
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! > kb[i]!;
        return a < b;
    };
    // A tip is a version no resolving version supersedes: a close that a re-open
    // superseded is no longer one.
    const superseded = new Set<string>();
    for (const id of resolving) {
        const parent = nodes.get(id)?.content.supersedes;
        if (parent) superseded.add(parent);
    }
    const closedTips = [...tips.keys()]
        .filter((id) => !superseded.has(id) && nodes.get(id)!.content.status === 'closed')
        .map((id) => ({ descriptorId: id, descriptor: nodes.get(id)!.content }));
    let best: ResolvedChannel | null = null;
    let bestId: string | null = null;
    for (const [id, c] of tips) {
        if (superseded.has(id) || overruled(id)) continue;
        const depth = depthCache.get(id)!;
        if (bestId === null || beats(id, bestId)) {
            best = {
                descriptor: nodes.get(id)!.content,
                descriptorId: id,
                epochs: depth,
                tipPubkey: c.ev.pubkey,
                chain: chainTo(id),
                versions: [...copies].map(([vid, cs]) => ({
                    descriptorId: vid,
                    descriptor: nodes.get(vid)!.content,
                    signers: cs.map((c) => c.ev.pubkey),
                    copies: cs.map((c) => c.ev.id),
                })),
                closedTips,
            };
            bestId = id;
        }
    }
    return best;
}

/** Where one version event stands in a resolved channel. */
export interface CopyStanding {
    descriptorId: string;
    /** Its version is on the chain from the genesis to the tip. */
    onChain: boolean;
    /** Its version is the tip the channel resolved to. */
    isTip: boolean;
}

/**
 * Is this event an authorized copy of a version of `resolved` (§8.3.1)? A version
 * stands when any copy of it is authorized, but an event is authorized only when
 * it is one of those copies: the same content signed by another key, or carried
 * by another event, is not, though its descriptor_id is the same. Null when the
 * event is not an authorized copy, or does not verify (NIP-01).
 */
export function authorizedCopy(resolved: ResolvedChannel | null, ev: NostrEvent): CopyStanding | null {
    if (!resolved || !verifyNostrEvent(ev)) return null;
    const v = resolved.versions.find((x) => x.copies.includes(ev.id));
    if (!v) return null;
    return {
        descriptorId: v.descriptorId,
        onChain: resolved.chain.some((c) => c.descriptorId === v.descriptorId),
        isTip: resolved.descriptorId === v.descriptorId,
    };
}

/** The reads readChannelVersions makes: one relay query, and every inbox key a principal's records have ever bound. */
export interface VersionReads {
    /** One REQ to the reader's relays. */
    query: Query;
    /** Every key a principal's device records have bound, revoked ones too (§8.3.1), and whether a relay answered. */
    everBoundKeys: (principal: string) => Promise<{ keys: string[]; answered: boolean }>;
}

/** Events asked for per page: relays commonly cap one REQ at 500. */
const VERSION_PAGE_LIMIT = 500;
/** Pages read for one channel's `t` tag: up to 2,000 events, as attest reads a subject. */
const VERSION_MAX_PAGES = 4;
/** Rounds of walking forward by `s` or back by exact d-tag past what the pages read. */
const VERSION_WALK_ROUNDS = 64;
/** Exact d-tags asked for per round of the walk back, so a REQ stays small. */
const VERSION_BACK_IDS = 100;
/** Keys read per principal: past this, one principal's rotations cannot fan the reader out. */
const VERSION_MAX_KEYS = 32;
/** REQs the founder's-keys read and the walk by `s` make in all. */
const VERSION_MAX_ROLE_REQS = 256;

/** The founder a version names, when its founder and slug derive `cid`. */
function founderFrom(e: NostrEvent, cid: string): string | null {
    const c = parseDescriptor(e);
    return c && c.channel_id === cid && channelId(c.founder_address, c.slug) === cid
        ? c.founder_address
        : null;
}

/**
 * Every version of a channel a reader can find (§8.3.1, 0.3.0), whether the open
 * read under its `t` tag stopped at the page bound, and whether the reads by
 * role holders' keys stopped short (an unanswered key lookup, or a bound).
 * Anyone can publish under that tag, so besides the paged open read and the
 * legacy d-tag it reads where a flood cannot reach: the versions the founder's
 * keys signed, then forward by `s` from each of those, by the keys of the role
 * holders that version names. Then back by exact d-tag to any version a
 * `supersedes` names, the parents role holders named first. Every copy is
 * kept. Throws UnansweredReadError when no read was answered.
 */
export async function readChannelVersions(
    cid: string,
    reads: VersionReads,
    founderHint?: string
): Promise<{ events: NostrEvent[]; truncated: boolean; incomplete: boolean }> {
    const queryEvents = reads.query;
    const merged = new Map<string, NostrEvent>();
    const status: { eose: boolean }[] = [];
    // Versions a role holder's key signed: the only ones the walk goes forward from.
    const walkable = new Set<string>();
    const roleKeys = new Set<string>();
    const add = (
        res: { events?: NostrEvent[]; relayStatus?: readonly { eose: boolean }[] },
        byRole = false
    ) => {
        status.push(...(res.relayStatus ?? []));
        let fresh = 0;
        for (const e of res.events ?? []) {
            if (byRole) walkable.add(e.id);
            if (merged.has(e.id)) continue;
            merged.set(e.id, e);
            fresh++;
        }
        return fresh;
    };
    const legacy = queryEvents({ kinds: [CHANNEL_DESCRIPTOR_KIND], '#d': [descriptorDtag(cid)] });

    // The open read, paged with `until` (inclusive; events already read are skipped).
    let until: number | undefined;
    let truncated = false;
    for (let page = 0; page < VERSION_MAX_PAGES; page++) {
        const res = await queryEvents({
            kinds: [CHANNEL_DESCRIPTOR_KIND],
            '#t': [cid],
            limit: VERSION_PAGE_LIMIT,
            ...(until !== undefined ? { until } : {}),
        });
        const fresh = add(res);
        for (const e of res.events ?? []) until = Math.min(until ?? Infinity, e.created_at);
        // A full page that brought something new may have more behind it.
        if ((res.events ?? []).length < VERSION_PAGE_LIMIT || fresh === 0) break;
        if (page === VERSION_MAX_PAGES - 1) truncated = true;
    }
    add(await legacy);

    // The founder's keys first, then forward from each version by `s`, from the
    // keys of the founder and the admins that version names. Every key their
    // records have bound counts, revoked ones too: an earlier version stands on
    // its binding whatever became of the key since. One REQ per key, so what one
    // key floods its own reads with hides only that key's own versions.
    let incomplete = false;
    let reqs = 0;
    const founder =
        founderHint ?? [...merged.values()].map((e) => founderFrom(e, cid)).find(Boolean) ?? null;
    if (!founder) incomplete = true;
    else {
        const keysCache = new Map<string, Promise<string[]>>();
        const keysOf = (p: string) => {
            if (!keysCache.has(p))
                keysCache.set(
                    p,
                    reads
                        .everBoundKeys(p)
                        .catch(() => ({ keys: [] as string[], answered: false }))
                        .then(({ keys, answered }) => {
                            if (!answered || keys.length > VERSION_MAX_KEYS) incomplete = true;
                            const used = keys.slice(0, VERSION_MAX_KEYS);
                            for (const k of used) roleKeys.add(k);
                            return used;
                        })
                );
            return keysCache.get(p)!;
        };
        const read = async (filter: Record<string, unknown>, keys: readonly string[]) => {
            const fresh = keys.slice(0, Math.max(0, VERSION_MAX_ROLE_REQS - reqs));
            if (fresh.length < keys.length) incomplete = true;
            reqs += fresh.length;
            for (const res of await Promise.all(
                fresh.map((k) =>
                    queryEvents({
                        kinds: [CHANNEL_DESCRIPTOR_KIND],
                        ...filter,
                        authors: [k],
                        limit: VERSION_PAGE_LIMIT,
                    })
                )
            )) {
                add(res, true);
            }
        };
        await read({ '#t': [cid] }, await keysOf(founder));
        const walked = new Set<string>();
        let round = 0;
        for (; round < VERSION_WALK_ROUNDS; round++) {
            const frontier: DescriptorContent[] = [];
            for (const e of merged.values()) {
                if (!walkable.has(e.id)) continue;
                const c = parseDescriptor(e);
                if (!c || c.channel_id !== cid) continue;
                const id = descriptorId(c);
                if (walked.has(id)) continue;
                walked.add(id);
                frontier.push(c);
            }
            if (frontier.length === 0) break;
            for (const c of frontier) {
                const keys = [
                    ...new Set((await Promise.all([founder, ...c.admins].map(keysOf))).flat()),
                ];
                await read({ '#s': [descriptorId(c)] }, keys);
            }
        }
        if (round === VERSION_WALK_ROUNDS) incomplete = true;
    }

    // Back by exact d-tag to any version a supersedes names that no read returned.
    const asked = new Set<string>();
    for (let round = 0; round < VERSION_WALK_ROUNDS; round++) {
        const have = new Set<string>();
        // Each parent named, and whether a role holder's key signed a version naming it.
        const wanted = new Map<string, boolean>();
        for (const e of merged.values()) {
            const c = parseDescriptor(e);
            if (!c || c.channel_id !== cid) continue;
            have.add(descriptorId(c));
            if (c.supersedes)
                wanted.set(c.supersedes, !!wanted.get(c.supersedes) || roleKeys.has(e.pubkey));
        }
        const missing = [...wanted]
            .filter(([id]) => !have.has(id) && !asked.has(id))
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, VERSION_BACK_IDS)
            .map(([id]) => id);
        if (missing.length === 0) break;
        for (const id of missing) asked.add(id);
        add(await queryEvents({ kinds: [CHANNEL_DESCRIPTOR_KIND], '#d': missing.map(versionDtag) }));
    }
    return {
        events: answeredEvents({ events: [...merged.values()], relayStatus: status }),
        truncated,
        incomplete,
    };
}


export interface ChannelPost {
    post: PostContent;
    postId: string;
    event: NostrEvent;
}

/**
 * Deterministic public-feed order (§8.3.2). A public multi-author channel has no
 * single hash-chain (independent broadcasters), so order is the event-level
 * created_at as a DISPLAY hint, tie-broken by the content-addressed post_id so
 * two clients always agree. created_at is untrusted (a relay can backdate); the
 * post_id tiebreak makes the order at least stable + reproducible across clients.
 */
export function orderChannelPosts(posts: ChannelPost[]): ChannelPost[] {
    return [...posts].sort((a, b) => {
        const at = a.event.created_at - b.event.created_at;
        return at !== 0 ? at : a.postId < b.postId ? -1 : a.postId > b.postId ? 1 : 0;
    });
}


/**
 * The posts of a channel that verify against its resolved descriptor (§8.3.2):
 * each one authored by a bound key and through the write gate, removal
 * tombstones applied (forward-effective, §8.3.5), copies of one post_id kept
 * once at their lowest created_at, in feed order. A post that fails MUST NOT
 * render, so it is left out.
 */
export async function verifyChannelPosts(
    events: readonly NostrEvent[],
    descriptor: DescriptorContent,
    opts: Pick<VerifyPostOpts, 'tipHeight' | 'verifyBip322' | 'verifyOnChain'> & { isBound: IsBound }
): Promise<ChannelPost[]> {
    const removed = new Set<string>();
    const byPostId = new Map<string, ChannelPost>();
    for (const ev of events) {
        const content = parsePost(ev);
        if (!content || content.channel_id !== descriptor.channel_id) continue;
        const controlSig = ev.tags.find((t) => t[0] === 'control_sig')?.[1];
        const v = await verifyPost(content, descriptor, {
            ...opts,
            event: ev,
            ...(controlSig ? { controlSig } : {}),
        });
        if (!v.ok) continue;
        if (v.isTombstone && content.removes) {
            removed.add(content.removes);
            continue;
        }
        const existing = byPostId.get(v.postId);
        if (!existing || ev.created_at < existing.event.created_at) {
            byPostId.set(v.postId, { post: content, postId: v.postId, event: ev });
        }
    }
    return orderChannelPosts([...byPostId.values()].filter((a) => !removed.has(a.postId)));
}
