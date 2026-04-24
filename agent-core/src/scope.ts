// Scope grammar, canonicalization, and sub-scope relation. See SPEC.md §7.
//
// A scope is <product>:<verb>(<constraint-list>).
// Constraints are <key><op><value>, op ∈ { =, !=, <, <=, >, >=, * }.
// Canonical form: constraints sorted by key; no whitespace.

export type ScopeOp = '=' | '!=' | '<' | '<=' | '>' | '>=' | '*';

export interface ScopeConstraint {
    key: string;
    op: ScopeOp;
    /** `undefined` for the wildcard `*` op; otherwise the raw textual value (unquoted). */
    value: string | undefined;
    /** True if the value was supplied as a quoted string; preserved for round-trip fidelity. */
    quoted: boolean;
}

export interface Scope {
    product: string;
    verb: string;
    constraints: ScopeConstraint[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Registered products/verbs (SPEC §7.3) and constraint keys (SPEC §7.6).
// ─────────────────────────────────────────────────────────────────────────────

export const REGISTERED_SCOPES: Record<string, { keys: string[] }> = {
    'lock:seal': { keys: ['recipient', 'mime', 'max_bytes'] },
    'lock:chat': { keys: ['recipient', 'max_bytes_per_msg', 'max_msgs'] },
    'stamp:sign': { keys: ['mime', 'max_bytes', 'content_hash_prefix'] },
    'vote:cast': { keys: ['poll_id', 'choice'] },
    'nostr:publish': { keys: ['kind', 'relay', 'max_bytes'] },
    'http:request': { keys: ['origin', 'method', 'max_rps', 'max_bytes_out'] },
    'ln:send': { keys: ['max_sats', 'node', 'max_fee_sats'] },
    'mcp:invoke': { keys: ['server', 'tool', 'max_invocations'] },
};

/** Keys whose values are compared numerically for sub-scope ordering. */
const NUMERIC_KEYS = new Set<string>([
    'max_bytes',
    'max_bytes_per_msg',
    'max_msgs',
    'max_bytes_out',
    'max_rps',
    'max_sats',
    'max_fee_sats',
    'max_invocations',
    'kind',
]);

const IDENT_RE = /^[a-z][a-z0-9_]*$/;
const BARE_TOKEN_RE = /^[A-Za-z0-9_.:/@+\-]+$/;

// ─────────────────────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────────────────────

export class ScopeParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ScopeParseError';
    }
}

export function parseScope(input: string): Scope {
    if (typeof input !== 'string' || input.length === 0) {
        throw new ScopeParseError('scope must be a non-empty string');
    }
    if (/\s/.test(input)) {
        throw new ScopeParseError(`scope may not contain whitespace: ${JSON.stringify(input)}`);
    }

    const colonIdx = input.indexOf(':');
    if (colonIdx < 0) throw new ScopeParseError('scope missing "product:verb" separator');

    const product = input.slice(0, colonIdx);
    if (!IDENT_RE.test(product)) throw new ScopeParseError(`invalid product: ${product}`);

    const rest = input.slice(colonIdx + 1);
    const parenIdx = rest.indexOf('(');

    let verb: string;
    let constraintText = '';
    if (parenIdx < 0) {
        verb = rest;
    } else {
        verb = rest.slice(0, parenIdx);
        if (!rest.endsWith(')')) throw new ScopeParseError('scope constraint list must end with ")"');
        constraintText = rest.slice(parenIdx + 1, -1);
    }
    if (!IDENT_RE.test(verb)) throw new ScopeParseError(`invalid verb: ${verb}`);

    const constraints: ScopeConstraint[] = [];
    if (constraintText.length > 0) {
        for (const piece of splitTopLevelCommas(constraintText)) {
            constraints.push(parseConstraint(piece));
        }
    }

    // No duplicate keys.
    const seen = new Set<string>();
    for (const c of constraints) {
        if (seen.has(c.key)) throw new ScopeParseError(`duplicate constraint key: ${c.key}`);
        seen.add(c.key);
    }

    return { product, verb, constraints };
}

function splitTopLevelCommas(text: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let inQuotes = false;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '\\' && i + 1 < text.length) {
                i++;
                continue;
            }
            if (ch === '"') inQuotes = false;
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
            out.push(text.slice(start, i));
            start = i + 1;
        }
    }
    out.push(text.slice(start));
    return out;
}

function parseConstraint(piece: string): ScopeConstraint {
    if (piece.length === 0) throw new ScopeParseError('empty constraint');

    // The `*` op (wildcard) is an op with no value. Recognized by "key=*" form.
    // SPEC uses "key=*"; we also accept "key*" as legacy alias.
    // Ops in descending length so ">=" beats ">" and "!=" beats "!".
    const OPS: ScopeOp[] = ['>=', '<=', '!=', '=', '>', '<'];

    // Special-case wildcard: "key=*" or "key*".
    const wildcardMatch = /^([a-z][a-z0-9_]*)(?:=\*|\*)$/.exec(piece);
    if (wildcardMatch) {
        return { key: wildcardMatch[1]!, op: '*', value: undefined, quoted: false };
    }

    for (const op of OPS) {
        const idx = piece.indexOf(op);
        if (idx <= 0) continue; // key must come first and be non-empty
        const key = piece.slice(0, idx);
        if (!IDENT_RE.test(key)) continue;
        const raw = piece.slice(idx + op.length);
        const { value, quoted } = parseValue(raw);
        return { key, op, value, quoted };
    }
    throw new ScopeParseError(`constraint missing operator: ${piece}`);
}

function parseValue(raw: string): { value: string; quoted: boolean } {
    if (raw.length === 0) throw new ScopeParseError('constraint value is empty');
    if (raw.startsWith('"')) {
        if (!raw.endsWith('"') || raw.length < 2) {
            throw new ScopeParseError(`unterminated quoted value: ${raw}`);
        }
        let v = '';
        for (let i = 1; i < raw.length - 1; i++) {
            const ch = raw[i]!;
            if (ch === '\\' && i + 1 < raw.length - 1) {
                const next = raw[++i]!;
                v += next;
            } else if (ch === '"') {
                throw new ScopeParseError(`unescaped quote in value: ${raw}`);
            } else {
                v += ch;
            }
        }
        return { value: v, quoted: true };
    }
    if (!BARE_TOKEN_RE.test(raw)) {
        throw new ScopeParseError(`invalid bare-token value: ${JSON.stringify(raw)}`);
    }
    return { value: raw, quoted: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonicalize
// ─────────────────────────────────────────────────────────────────────────────

export function canonicalizeScope(scope: Scope): string {
    const sorted = [...scope.constraints].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const parts = sorted.map(serializeConstraint);
    const inner = parts.join(',');
    return `${scope.product}:${scope.verb}${parts.length === 0 ? '' : `(${inner})`}`;
}

export function canonicalizeScopeString(input: string): string {
    return canonicalizeScope(parseScope(input));
}

function serializeConstraint(c: ScopeConstraint): string {
    if (c.op === '*') return `${c.key}=*`;
    const v = c.quoted ? quoteValue(c.value ?? '') : c.value ?? '';
    return `${c.key}${c.op}${v}`;
}

function quoteValue(v: string): string {
    let out = '"';
    for (const ch of v) {
        if (ch === '"' || ch === '\\') out += '\\' + ch;
        else out += ch;
    }
    out += '"';
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry-based validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationOptions {
    /**
     * Strict: reject unknown products/verbs and unknown constraint keys.
     * Permissive: accept unknown products/verbs; ignore unknown keys without treating them as wider.
     * Default: 'strict'.
     */
    mode?: 'strict' | 'permissive';
}

export function validateScope(scope: Scope, options: ValidationOptions = {}): void {
    const mode = options.mode ?? 'strict';
    const reg = REGISTERED_SCOPES[`${scope.product}:${scope.verb}`];
    if (!reg) {
        if (mode === 'strict') {
            throw new ScopeParseError(`unregistered scope: ${scope.product}:${scope.verb}`);
        }
        return; // permissive: no further checks
    }
    const registered = new Set(reg.keys);
    for (const c of scope.constraints) {
        if (!registered.has(c.key)) {
            if (mode === 'strict') {
                throw new ScopeParseError(
                    `unregistered constraint key for ${scope.product}:${scope.verb}: ${c.key}`
                );
            }
            // permissive: ignore
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-scope relation (SPEC §7.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is `exercised` a sub-scope of `granted`?
 * Returns true iff every constraint of `granted` admits the corresponding constraint
 * (or absence) in `exercised`, per SPEC §7.4.
 */
export function isSubScope(exercised: Scope, granted: Scope): boolean {
    if (exercised.product !== granted.product) return false;
    if (exercised.verb !== granted.verb) return false;

    const exIndex = new Map<string, ScopeConstraint>();
    for (const c of exercised.constraints) exIndex.set(c.key, c);

    for (const g of granted.constraints) {
        const ex = exIndex.get(g.key);
        if (g.op === '*') continue; // wildcard: no requirement

        if (g.op === '=') {
            if (!ex) return false;
            if (ex.op !== '=' || ex.value !== g.value) return false;
            continue;
        }

        if (g.op === '!=') {
            if (!ex) return false;
            if (ex.op === '=' && ex.value !== g.value) continue;
            if (ex.op === '!=' && ex.value === g.value) continue;
            return false;
        }

        // Ordered ops: >=, <=, >, <. Exercised's implied range must be ⊆ granted's.
        if (g.op === '<' || g.op === '<=' || g.op === '>' || g.op === '>=') {
            if (!ex) return false;
            if (!NUMERIC_KEYS.has(g.key)) return false;
            if (ex.op === '*') return false;
            if (ex.value === undefined || g.value === undefined) return false;
            if (!rangeSubset(ex, g)) return false;
            continue;
        }
    }
    return true;
}

function rangeSubset(ex: ScopeConstraint, g: ScopeConstraint): boolean {
    const exRange = opToRange(ex);
    const gRange = opToRange(g);
    if (!exRange || !gRange) return false;
    return gRange.lo <= exRange.lo && exRange.hi <= gRange.hi;
}

function opToRange(c: ScopeConstraint): { lo: number; hi: number } | null {
    if (c.value === undefined) return null;
    const n = Number(c.value);
    if (!Number.isFinite(n)) return null;
    switch (c.op) {
        case '=':
            return { lo: n, hi: n };
        case '<':
            return { lo: -Infinity, hi: n - 1 }; // integers only
        case '<=':
            return { lo: -Infinity, hi: n };
        case '>':
            return { lo: n + 1, hi: Infinity };
        case '>=':
            return { lo: n, hi: Infinity };
        default:
            return null;
    }
}
