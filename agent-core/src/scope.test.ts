import { describe, expect, it } from 'vitest';

import {
    canonicalizeScope,
    canonicalizeScopeString,
    contentBoundScope,
    isSubScope,
    parseScope,
    ScopeParseError,
    validateScope,
} from './scope.js';

describe('parseScope', () => {
    it('parses a bare product:verb scope', () => {
        const s = parseScope('nostr:publish');
        expect(s.product).toBe('nostr');
        expect(s.verb).toBe('publish');
        expect(s.constraints).toHaveLength(0);
    });

    it('parses constraints with =, !=, <=, >=', () => {
        const s = parseScope('ln:send(max_sats<=1000,node=03abc,max_fee_sats<=10)');
        expect(s.constraints).toHaveLength(3);
        expect(s.constraints.find((c) => c.key === 'max_sats')?.op).toBe('<=');
        expect(s.constraints.find((c) => c.key === 'node')?.op).toBe('=');
    });

    it('accepts a wildcard constraint', () => {
        const s = parseScope('http:request(origin=*)');
        expect(s.constraints[0]?.op).toBe('*');
    });

    it('rejects whitespace', () => {
        expect(() => parseScope('lock:seal (recipient=bc)')).toThrow(ScopeParseError);
    });

    it('rejects duplicate keys', () => {
        expect(() => parseScope('ln:send(max_sats=1,max_sats=2)')).toThrow(ScopeParseError);
    });

    it('parses quoted values', () => {
        const s = parseScope('http:request(origin="https://a.example,b")');
        expect(s.constraints[0]?.value).toBe('https://a.example,b');
        expect(s.constraints[0]?.quoted).toBe(true);
    });
});

describe('canonicalize', () => {
    it('sorts constraints by key', () => {
        expect(canonicalizeScopeString('ln:send(node=03abc,max_sats<=1000)')).toBe(
            'ln:send(max_sats<=1000,node=03abc)'
        );
    });

    it('canonicalizes a no-constraint scope', () => {
        expect(canonicalizeScopeString('stamp:sign')).toBe('stamp:sign');
    });

    it('round-trips quoted values', () => {
        expect(canonicalizeScopeString('http:request(origin="a,b")')).toBe(
            'http:request(origin="a,b")'
        );
    });
});

describe('validateScope', () => {
    it('strict mode rejects unregistered product', () => {
        expect(() => validateScope(parseScope('xxx:yyy'))).toThrow(ScopeParseError);
    });

    it('strict mode rejects unregistered constraint key', () => {
        expect(() => validateScope(parseScope('lock:seal(zzz=1)'))).toThrow(ScopeParseError);
    });

    it('permissive mode accepts unregistered product/key', () => {
        expect(() =>
            validateScope(parseScope('xxx:yyy(foo=1)'), { mode: 'permissive' })
        ).not.toThrow();
    });
});

describe('isSubScope (SPEC §7.4)', () => {
    const cs = (s: string) => canonicalizeScope(parseScope(s));
    void cs;

    it('accepts exact match', () => {
        expect(
            isSubScope(
                parseScope('lock:seal(recipient=bc1qalice)'),
                parseScope('lock:seal(recipient=bc1qalice)')
            )
        ).toBe(true);
    });

    it('rejects different value under =', () => {
        expect(
            isSubScope(
                parseScope('stamp:sign(mime=application/pdf)'),
                parseScope('stamp:sign(mime=text/markdown)')
            )
        ).toBe(false);
    });

    it('accepts tighter numeric range', () => {
        expect(
            isSubScope(
                parseScope('ln:send(max_sats=500,node=03abc,max_fee_sats=5)'),
                parseScope('ln:send(max_sats<=1000,node=03abc,max_fee_sats<=10)')
            )
        ).toBe(true);
    });

    it('rejects wider numeric range', () => {
        expect(
            isSubScope(
                parseScope('ln:send(max_sats=5000)'),
                parseScope('ln:send(max_sats<=1000)')
            )
        ).toBe(false);
    });

    it('wildcard grants admit anything', () => {
        expect(
            isSubScope(
                parseScope('http:request(origin=https://evil.com)'),
                parseScope('http:request(origin=*)')
            )
        ).toBe(true);
    });

    it('exercised may add keys not in granted', () => {
        expect(
            isSubScope(
                parseScope('ln:send(max_sats=500,node=03abc,max_fee_sats=5)'),
                parseScope('ln:send(max_sats<=1000)')
            )
        ).toBe(true);
    });

    it('rejects mismatched product or verb', () => {
        expect(
            isSubScope(parseScope('lock:chat'), parseScope('lock:seal'))
        ).toBe(false);
    });

    it('accepts != with admissible value', () => {
        expect(
            isSubScope(
                parseScope('http:request(method=GET)'),
                parseScope('http:request(method!=POST)')
            )
        ).toBe(true);
    });

    it('rejects != with disallowed value', () => {
        expect(
            isSubScope(
                parseScope('http:request(method=POST)'),
                parseScope('http:request(method!=POST)')
            )
        ).toBe(false);
    });
});

// SPEC §7.4: "values MUST be decimal integers for ordered ops". `Number()` is
// much looser and accepted 1e3, 0x3e8, +1000, " 1000 " and 1.5 — plus "", which
// becomes 0 and turns an empty constraint into a silent zero bound. A verifier
// with a strict decimal parser rejects all of them, so identical bytes produced
// different accept/reject answers across implementations, which SECURITY §5
// rules out.
describe('ordered-op values must be decimal integers (SPEC §7.4)', () => {
    const granted = parseScope('ln:send(max_sats<=1000)');

    it('still admits a plain decimal integer', () => {
        expect(isSubScope(parseScope('ln:send(max_sats<=500)'), granted)).toBe(true);
        expect(isSubScope(parseScope('ln:send(max_sats<=1000)'), granted)).toBe(true);
    });

    it('still rejects a decimal integer outside the granted range', () => {
        expect(isSubScope(parseScope('ln:send(max_sats<=1001)'), granted)).toBe(false);
    });

    // Each of these previously compared numerically and could be ADMITTED.
    for (const v of ['1e3', '0x3e8', '+1000', '1.5']) {
        it(`rejects ${JSON.stringify(v)} rather than coercing it`, () => {
            let exercised;
            try {
                exercised = parseScope(`ln:send(max_sats<=${v})`);
            } catch {
                return; // rejected at parse time is also a rejection
            }
            expect(isSubScope(exercised, granted)).toBe(false);
        });
    }

    // The sharpest case: Number('') === 0, so an empty constraint became
    // max_sats<=0 — a real bound nobody wrote.
    it('does not silently read an empty value as zero', () => {
        let exercised;
        try {
            exercised = parseScope('ln:send(max_sats<=)');
        } catch {
            return;
        }
        expect(isSubScope(exercised, parseScope('ln:send(max_sats<=0)'))).toBe(false);
    });
});

// oc-pledge-protocol SPEC §7.3 defines pledge:create and its constraint keys.
describe('pledge:create is a registered scope', () => {
    for (const s of [
        'pledge:create',
        'pledge:create(max_bond_sats=2000000)',
        'pledge:create(mechanism=vote_resolves)',
        'pledge:create(counterparty=bc1qalice000000000000000000000000000000000)',
        'pledge:create(max_bond_sats=2000000,mechanism=vote_resolves,counterparty=bc1qalice000000000000000000000000000000000)',
    ]) {
        it(`strict mode accepts ${s}`, () => {
            expect(() => validateScope(parseScope(s), { mode: 'strict' })).not.toThrow();
        });
    }

    it('strict mode still rejects an unregistered pledge:create key', () => {
        expect(() => validateScope(parseScope('pledge:create(foo=1)'), { mode: 'strict' })).toThrow(ScopeParseError);
    });

    it('max_bond_sats is an ordered numeric bound', () => {
        const granted = parseScope('pledge:create(max_bond_sats<=2000000)');
        expect(isSubScope(parseScope('pledge:create(max_bond_sats=500000)'), granted)).toBe(true);
        expect(isSubScope(parseScope('pledge:create(max_bond_sats=3000000)'), granted)).toBe(false);
    });
});

// SPEC §7.3 / §7.6 (1.4.0): the scopes the agent-stack adapters exercise.
describe('the adapter scopes are registered', () => {
    for (const s of [
        'anthropic:tool(name=invoice.create)',
        'openai:function(name=getWeather)',
        'vercel:tool(verb=invoice.create)',
        'langgraph:tool(verb=search)',
        'anthropic:tool(name=*)',
    ]) {
        it(`strict mode accepts ${s}`, () => {
            expect(() => validateScope(parseScope(s), { mode: 'strict' })).not.toThrow();
        });
    }

    it('strict mode rejects a key the adapter does not use', () => {
        expect(() => validateScope(parseScope('vercel:tool(name=search)'), { mode: 'strict' })).toThrow(ScopeParseError);
        expect(() => validateScope(parseScope('anthropic:tool(verb=search)'), { mode: 'strict' })).toThrow(ScopeParseError);
    });

    it('a tool grant admits only that tool, case included', () => {
        const granted = parseScope('openai:function(name=getWeather)');
        expect(isSubScope(parseScope('openai:function(name=getWeather)'), granted)).toBe(true);
        expect(isSubScope(parseScope('openai:function(name=getweather)'), granted)).toBe(false);
        expect(isSubScope(parseScope('openai:function(name=deleteAll)'), granted)).toBe(false);
        expect(isSubScope(parseScope('anthropic:tool(name=getWeather)'), granted)).toBe(false);
    });
});

// SPEC §7.2 rule 2 (errata 1.6.2): values keep their case on every key, not only the
// four marked case-sensitive. Folding would break base58 addresses and widen grants.
describe('scope values keep their case (SPEC §7.2)', () => {
    for (const s of [
        'lock:seal(recipient=1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2)',
        'mcp:invoke(server=https://mcp.example.com/Tools,tool=getWeather)',
        'http:request(method=GET,origin=https://api.example.com)',
    ]) {
        it(`canonical form of ${s} is unchanged`, () => {
            expect(canonicalizeScopeString(s)).toBe(s);
        });
    }

    it('a grant on a key not marked case-sensitive still matches case exactly', () => {
        const granted = parseScope('mcp:invoke(tool=getWeather)');
        expect(isSubScope(parseScope('mcp:invoke(tool=getWeather)'), granted)).toBe(true);
        expect(isSubScope(parseScope('mcp:invoke(tool=GetWeather)'), granted)).toBe(false);
    });
});

// SPEC §7.2 rule 4 and §7.4 (1.10.0): an integer key's value is a decimal
// integer and `!=` compares it as one; a method holds no lower-case letter.
// Otherwise `kind!=0` would be met by `kind=00` and `method!=POST` by `post`.
describe('a number or a method has one meaning under != (SPEC §7.2, §7.4)', () => {
    const notZero = parseScope('nostr:publish(kind!=0)');
    const notPost = parseScope('http:request(method!=POST)');

    it('kind!=0 is not met by another spelling of 0', () => {
        expect(isSubScope(parseScope('nostr:publish(kind=0)'), notZero)).toBe(false);
        expect(isSubScope(parseScope('nostr:publish(kind=00)'), notZero)).toBe(false);
        expect(isSubScope(parseScope('nostr:publish(kind="0")'), notZero)).toBe(false);
    });

    it('kind!=0 is met by another number, however it is spelled', () => {
        expect(isSubScope(parseScope('nostr:publish(kind=1)'), notZero)).toBe(true);
        expect(isSubScope(parseScope('nostr:publish(kind=01)'), notZero)).toBe(true);
        expect(isSubScope(parseScope('nostr:publish(kind!=00)'), notZero)).toBe(true);
        expect(isSubScope(parseScope('nostr:publish(kind!=1)'), notZero)).toBe(false);
    });

    it('kind!=0 is not met by a value that is not a number', () => {
        expect(isSubScope(parseScope('nostr:publish(kind=abc)'), notZero)).toBe(false);
        expect(isSubScope(parseScope('ln:send(max_sats=x)'), parseScope('ln:send(max_sats!=0)'))).toBe(false);
    });

    it('method!=POST is not met by a lower-case method', () => {
        expect(isSubScope(parseScope('http:request(method=post)'), notPost)).toBe(false);
        expect(isSubScope(parseScope('http:request(method=Post)'), notPost)).toBe(false);
        expect(isSubScope(parseScope('http:request(method=GET)'), notPost)).toBe(true);
    });

    for (const mode of ['strict', 'permissive'] as const) {
        for (const s of [
            'nostr:publish(kind=abc)',
            'nostr:publish(kind=1.5)',
            'ln:send(max_sats<=1e3)',
            'http:request(method=post)',
            'http:request(method!=Post)',
        ]) {
            it(`${mode} mode refuses ${s}`, () => {
                expect(() => validateScope(parseScope(s), { mode })).toThrow(ScopeParseError);
            });
        }
    }

    for (const s of [
        'nostr:publish(kind=0)',
        'nostr:publish(kind=00)',
        'nostr:publish(kind=*)',
        'http:request(method=GET)',
        'http:request(method=M-SEARCH)',
        'http:request(method=*)',
    ]) {
        it(`strict mode accepts ${s}`, () => {
            expect(() => validateScope(parseScope(s), { mode: 'strict' })).not.toThrow();
        });
    }
});

// SPEC §7.6 (1.10.0): permissive mode accepts a key it does not know, and the
// key still binds. §7.4 applies to every granted constraint.
describe('an unregistered granted key binds in both modes (SPEC §7.6)', () => {
    const granted = parseScope('http:request(origin=https://a.example,zzz=1)');

    it('strict mode refuses the grant; permissive mode reads it', () => {
        expect(() => validateScope(granted, { mode: 'strict' })).toThrow(ScopeParseError);
        expect(() => validateScope(granted, { mode: 'permissive' })).not.toThrow();
    });

    it('an exercised scope must meet it', () => {
        expect(isSubScope(parseScope('http:request(origin=https://a.example)'), granted)).toBe(false);
        expect(isSubScope(parseScope('http:request(origin=https://a.example,zzz=2)'), granted)).toBe(false);
        expect(isSubScope(parseScope('http:request(origin=https://a.example,zzz=1)'), granted)).toBe(true);
    });
});

// SPEC §7.2 rule 4 (1.10.0): hex, MIME types and bech32 addresses have one
// spelling, lower case; a base58 address is case-sensitive and kept as written.
describe('hex, MIME and bech32 values are lower case (SPEC §7.2 rule 4)', () => {
    for (const mode of ['strict', 'permissive'] as const) {
        for (const s of [
            'ln:send(node=03ABCDEF)',
            'vote:cast(poll_id=AB12)',
            'stamp:sign(content_hash_prefix=sha256:AB)',
            'stamp:sign(mime=Text/Markdown)',
            'lock:seal(recipient=BC1QALICE)',
            'lock:chat(recipient=bc1qAlice)',
            'pledge:create(counterparty=TB1QBOB)',
        ]) {
            it(`${mode} mode refuses ${s}`, () => {
                expect(() => validateScope(parseScope(s), { mode })).toThrow(ScopeParseError);
            });
        }
    }

    for (const s of [
        'ln:send(node=03abcdef)',
        'stamp:sign(mime=text/markdown)',
        'lock:seal(recipient=bc1qalice)',
        'lock:seal(recipient=1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2)',
        'lock:seal(recipient=3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy)',
        'pledge:create(counterparty=null)',
    ]) {
        it(`strict mode accepts ${s}`, () => {
            expect(() => validateScope(parseScope(s), { mode: 'strict' })).not.toThrow();
        });
    }

    it('!= is not met by the upper-case spelling of the value it withholds', () => {
        const notBob = parseScope('lock:seal(recipient!=bc1qbob)');
        expect(isSubScope(parseScope('lock:seal(recipient=BC1QBOB)'), notBob)).toBe(false);
        expect(isSubScope(parseScope('lock:seal(recipient=bc1qcarol)'), notBob)).toBe(true);
        const notPdf = parseScope('stamp:sign(mime!=application/pdf)');
        expect(isSubScope(parseScope('stamp:sign(mime=Application/PDF)'), notPdf)).toBe(false);
    });

    it('a base58 address keeps its case under !=', () => {
        const granted = parseScope('lock:seal(recipient!=1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2)');
        expect(isSubScope(parseScope('lock:seal(recipient=1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2)'), granted)).toBe(false);
        expect(isSubScope(parseScope('lock:seal(recipient=3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy)'), granted)).toBe(true);
    });
});

// SPEC §7.2 rule 4 (1.10.0): a URL's scheme and host are lower case, the
// canonical origin form; its path, query and fragment keep their case.
describe('a URL value has its scheme and host in lower case (SPEC §7.2 rule 4)', () => {
    for (const mode of ['strict', 'permissive'] as const) {
        for (const s of [
            'http:request(origin=https://API.example.com)',
            'http:request(origin=HTTPS://api.example.com)',
            'mcp:invoke(server=https://Mcp.example.com/tools)',
            'nostr:publish(relay=wss://Relay.example.com)',
            'mcp:invoke(server=Stdio:local/tool)',
            'http:request(origin=API.example.com/x)',
        ]) {
            it(`${mode} mode refuses ${s}`, () => {
                expect(() => validateScope(parseScope(s), { mode })).toThrow(ScopeParseError);
            });
        }
    }

    for (const s of [
        'mcp:invoke(server=https://mcp.example.com/Tools)',
        'http:request(origin=https://api.example.com:8443)',
        'mcp:invoke(server=stdio:oc-agent-examples/Verifying-Server)',
        'nostr:publish(relay="wss://relay.example.com/?Q=1#Frag")',
    ]) {
        it(`strict mode accepts ${s}`, () => {
            expect(() => validateScope(parseScope(s), { mode: 'strict' })).not.toThrow();
        });
    }

    it('origin!= is not met by the same origin with an upper-case host', () => {
        const notEvil = parseScope('http:request(origin!=https://evil.example)');
        expect(isSubScope(parseScope('http:request(origin=https://EVIL.example)'), notEvil)).toBe(false);
        expect(isSubScope(parseScope('http:request(origin=https://good.example)'), notEvil)).toBe(true);
    });
});

// SPEC §7.2 rule 4 and §7.4 (1.10.0, review): one spelling per value, in ASCII.
describe('values with one spelling, in ASCII (SPEC §7.2 rule 4)', () => {
    for (const s of [
        'stamp:sign(mime="text/html;charset=utf-8")',
        'stamp:sign(mime="text/html;")',
        'stamp:sign(mime=text)',
        'http:request(method="\u0420OST")',
        'http:request(method="GE T")',
        'ln:send(node=03xyz)',
        'vote:cast(poll_id="\u0430b12")',
        'stamp:sign(content_hash_prefix=sha256:ab)',
        'http:request(origin="https:\\\\api.example.com")',
        'mcp:invoke(server=stdio:Local/tool)',
    ]) {
        it(`refuses ${s}`, () => {
            expect(() => validateScope(parseScope(s), { mode: 'strict' })).toThrow(ScopeParseError);
        });
    }

    for (const s of [
        'stamp:sign(mime=application/vnd.oc-lock+json)',
        'http:request(method=M-SEARCH)',
        'stamp:sign(content_hash_prefix=ab12)',
        'mcp:invoke(server=stdio:oc-agent-examples/Verifying-Server)',
    ]) {
        it(`accepts ${s}`, () => {
            expect(() => validateScope(parseScope(s), { mode: 'strict' })).not.toThrow();
        });
    }

    it('mime!= is not met by the same type with parameters', () => {
        const notHtml = parseScope('stamp:sign(mime!=text/html)');
        expect(isSubScope(parseScope('stamp:sign(mime="text/html;charset=utf-8")'), notHtml)).toBe(false);
        expect(isSubScope(parseScope('stamp:sign(mime=text/plain)'), notHtml)).toBe(true);
    });

    it('method!= is not met by a look-alike letter', () => {
        expect(isSubScope(parseScope('http:request(method="\u0420OST")'), parseScope('http:request(method!=POST)'))).toBe(false);
    });
});

// SPEC §7.2 rule 5 and §7.4 (1.10.0): a *_prefix key means "starts with". It is
// granted with = and never with !=.
describe('a prefix key is granted with = and means "starts with" (SPEC §7.4)', () => {
    const ab = parseScope('stamp:sign(content_hash_prefix=ab)');
    const sub = (s: string) => isSubScope(parseScope(s), ab);

    it('is met by the same prefix or a longer one', () => {
        expect(sub('stamp:sign(content_hash_prefix=ab)')).toBe(true);
        expect(sub('stamp:sign(content_hash_prefix=abc)')).toBe(true);
    });

    it('is not met by a shorter prefix, another prefix, or none', () => {
        expect(sub('stamp:sign(content_hash_prefix=a)')).toBe(false);
        expect(sub('stamp:sign(content_hash_prefix=ac)')).toBe(false);
        expect(sub('stamp:sign')).toBe(false);
    });

    for (const mode of ['strict', 'permissive'] as const) {
        it(`${mode} mode refuses != on a prefix key`, () => {
            expect(() =>
                validateScope(parseScope('stamp:sign(content_hash_prefix!=ab)'), { mode })
            ).toThrow(ScopeParseError);
        });
    }

    it('a != grant on a prefix key admits nothing', () => {
        const notAb = parseScope('stamp:sign(content_hash_prefix!=ab)');
        expect(isSubScope(parseScope('stamp:sign(content_hash_prefix=ac)'), notAb)).toBe(false);
    });
});

// SPEC §7.2 rule 5: only a registered prefix key reads as "starts with".
describe('prefix keys come from the registry, not the name', () => {
    it('an unregistered *_prefix key compares exactly in permissive mode', () => {
        const granted = parseScope('lock:seal(path_prefix=/a)');
        expect(() => validateScope(granted, { mode: 'permissive' })).not.toThrow();
        expect(isSubScope(parseScope('lock:seal(path_prefix=/admin)'), granted)).toBe(false);
        expect(isSubScope(parseScope('lock:seal(path_prefix=/a)'), granted)).toBe(true);
    });
});

// SPEC §8.3 step 12a: content-bound keys are read from the action's signed content.
describe('contentBoundScope', () => {
    const content = { hash: 'sha256:' + 'AB'.repeat(32), length: 12, mime: 'Text/Plain; charset=utf-8' };
    const valueOf = (s: string, key: string) =>
        contentBoundScope(parseScope(s), content).constraints.find((c) => c.key === key)?.value;

    it('replaces the claimed values with the content’s own', () => {
        const s = 'stamp:sign(content_hash_prefix=ff,max_bytes<=1,mime=image/png)';
        expect(valueOf(s, 'mime')).toBe('text/plain');
        expect(valueOf(s, 'max_bytes')).toBe('12');
        expect(valueOf(s, 'content_hash_prefix')).toBe('ab'.repeat(32));
    });

    it('adds them when the claim leaves them out, and keeps every other constraint', () => {
        const out = contentBoundScope(parseScope('stamp:sign'), content);
        expect(out.constraints.map((c) => c.key).sort()).toEqual(['content_hash_prefix', 'max_bytes', 'mime']);
    });

    it('leaves a scope with no content-bound keys as it is', () => {
        const lock = parseScope('lock:seal(mime=text/plain,recipient=bc1qalice)');
        expect(contentBoundScope(lock, content)).toBe(lock);
    });

    it('meets a grant only when the content itself does', () => {
        const granted = parseScope('stamp:sign(content_hash_prefix=ab,max_bytes<=12,mime=text/plain)');
        expect(isSubScope(contentBoundScope(parseScope('stamp:sign'), content), granted)).toBe(true);
        expect(isSubScope(contentBoundScope(parseScope('stamp:sign'), { ...content, length: 13 }), granted)).toBe(false);
        expect(isSubScope(contentBoundScope(parseScope('stamp:sign'), { ...content, mime: 'text/html' }), granted)).toBe(false);
        expect(isSubScope(contentBoundScope(parseScope('stamp:sign'), { ...content, hash: 'sha256:' + 'c'.repeat(64) }), granted)).toBe(false);
    });
});
