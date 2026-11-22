/** The quickstart's "check it before real people sign in", as far as a site can be checked from outside. */

import type { Docs } from './docs.js';
import { checkDomain, fetchFollowing, normalizeDomain, sameSite, type DomainCheck, type DomainDeps, type FetchedPage } from './domain.js';
import { readProject, type ProjectReport } from './project.js';
import { section } from './markdown.js';

const QUICKSTART = 'https://ochk.io/docs/me/quickstart';
const INTEGRATIONS_ERRORS = 'https://ochk.io/docs/me/integrations#errors-and-edge-cases';
const SDK_ENDED = 'https://ochk.io/docs/me/sdk#when-someone-ends-every-session';

export type Verdict = 'pass' | 'fail' | 'warn' | 'info';

export interface Finding {
    check: string;
    verdict: Verdict;
    detail: string;
    docs?: string;
}

export interface SetupReport {
    site: string;
    domain: string;
    /** The origin people end up on: what your server passes as `audience`. */
    origin?: string;
    findings: Finding[];
    /** The quickstart's checklist, verbatim, for what can't be seen from outside. */
    byHand?: string;
    byHandSource: string;
}

export interface SetupDeps extends DomainDeps {
    docs: Docs;
}

const originOf = (url: string) => new URL(url).origin;
const finalUrl = (p: FetchedPage) => p.final?.url;

function twinOf(domain: string): string {
    return domain.startsWith('www.') ? domain.slice(4) : `www.${domain}`;
}

export async function checkSetup(
    deps: SetupDeps,
    input: { site: string; projectKey?: string; token?: string }
): Promise<SetupReport> {
    const raw = input.site.trim();
    const domain = normalizeDomain(raw);
    let start = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`https://${domain}/`);
    if (start.protocol === 'http:') start = new URL(start.toString().replace(/^http:/i, 'https:'));
    const findings: Finding[] = [];

    const [https, http, twin, domainCheck, project, checklist] = await Promise.all([
        fetchFollowing(deps, start.toString()),
        fetchFollowing(deps, `http://${domain}${start.pathname}`, { stayOn: domain }),
        fetchFollowing(deps, `https://${twinOf(domain)}/`),
        checkDomain(deps, domain, input.token).catch((err: Error) => err),
        input.projectKey ? readProject(deps.fetch, input.projectKey).catch((err: Error) => err) : Promise.resolve(undefined),
        deps.docs
            .page('/me/quickstart')
            .then((p) => section(p.markdown, '5 · check it before real people sign in')?.markdown)
            .catch(() => undefined),
    ]);

    // HTTPS
    let origin: string | undefined;
    if (https.error) {
        findings.push({
            check: 'HTTPS',
            verdict: 'fail',
            detail: `${start.toString()} did not load over HTTPS: ${https.error.message}${https.error.code?.startsWith('CERT') || https.error.code?.includes('TLS') ? ' Its certificate is not valid.' : ''}`,
            docs: `${QUICKSTART}#2--add-the-sign-in-popup`,
        });
    } else if (https.offsite && !https.final) {
        findings.push({ check: 'HTTPS', verdict: 'warn', detail: `${start.toString()} redirects to ${https.offsite}, which is not a web page this check follows.` });
    } else if (https.final && https.final.status >= 200 && https.final.status < 300) {
        origin = originOf(https.final.url);
        const chain = https.hops.length > 1 ? ` after ${https.hops.length - 1} redirect${https.hops.length > 2 ? 's' : ''}` : '';
        if (origin.startsWith('http:')) {
            findings.push({
                check: 'HTTPS',
                verdict: 'fail',
                detail: `${start.toString()} ends on ${origin}, over plain HTTP. The session cookie in the quickstart is Secure, and a token is bound to the exact origin, http or https.`,
                docs: `${QUICKSTART}#2--add-the-sign-in-popup`,
            });
        } else {
            findings.push({ check: 'HTTPS', verdict: 'pass', detail: `${https.final.url} answered ${https.final.status} over HTTPS${chain}.` });
        }
    } else if (https.final) {
        findings.push({
            check: 'HTTPS',
            verdict: 'fail',
            detail: `${https.final.url} answered ${https.final.status}.`,
        });
    }

    // http:// sends people to https://
    const httpLast = http.hops.at(-1);
    if (http.error) {
        findings.push({ check: 'HTTP redirect', verdict: 'info', detail: `http://${domain}/ did not answer (${http.error.message}). Fine if nothing serves plain HTTP.` });
    } else if (http.final && http.hops.length > 1 && finalUrl(http)?.startsWith('https://')) {
        findings.push({ check: 'HTTP redirect', verdict: 'pass', detail: `http://${domain}${start.pathname} redirects to ${finalUrl(http)}.` });
    } else if (http.final && http.final.status >= 200 && http.final.status < 300 && http.final.url.startsWith('http:')) {
        findings.push({
            check: 'HTTP redirect',
            verdict: 'warn',
            detail: `http://${domain}${start.pathname} serves the page over plain HTTP instead of redirecting to https://. Someone signing in from there opens the popup from an http origin: their token is refused by a server whose audience is https.`,
            docs: INTEGRATIONS_ERRORS,
        });
    } else if (http.offsite) {
        findings.push({ check: 'HTTP redirect', verdict: 'info', detail: `http://${domain}/ redirects off the site, to ${http.offsite}.` });
    } else if (httpLast) {
        findings.push({ check: 'HTTP redirect', verdict: 'info', detail: `http://${domain}/ answered ${httpLast.status}.` });
    }

    // www and the apex
    const twinHost = twinOf(domain);
    const twinFinal = twin.final && twin.final.status >= 200 && twin.final.status < 300 ? originOf(twin.final.url) : undefined;
    if (origin && twinFinal) {
        if (twinFinal === origin) {
            findings.push({
                check: 'www and the apex',
                verdict: 'pass',
                detail: `https://${twinHost}/ ends on ${origin} too, so people open the popup from one origin.`,
            });
        } else if (sameSite(new URL(twinFinal).hostname, domain)) {
            findings.push({
                check: 'www and the apex',
                verdict: 'warn',
                detail: `https://${domain}/ ends on ${origin} and https://${twinHost}/ on ${twinFinal}. A token is bound to the origin that opened the popup, so a server whose audience names only one refuses the other's tokens (401 right after a sign-in). Redirect one to the other, or pass both: audience: ['${origin}', '${twinFinal}'].`,
                docs: SDK_ENDED,
            });
        }
    }
    if (origin) {
        findings.push({
            check: 'audience',
            verdict: 'info',
            detail: `People end up on ${origin}. That exact string is the audience your server passes to checkOcToken and withOcAuth (or verify_session in Python).`,
            docs: `${QUICKSTART}#3--check-the-session-on-your-server`,
        });
    }

    // Cross-Origin-Opener-Policy on the page that opens the popup
    if (https.final && https.final.status < 400) {
        const coop = https.final.headers.get('cross-origin-opener-policy')?.split(';')[0]?.trim().toLowerCase();
        if (coop === 'same-origin') {
            findings.push({
                check: 'Cross-Origin-Opener-Policy',
                verdict: 'fail',
                detail: `${https.final.url} sends Cross-Origin-Opener-Policy: same-origin. A page with it never gets the popup's token back: send same-origin-allow-popups, or no such header. (Checked on this page only: check the page your sign-in button is on, if it is another.)`,
                docs: `${QUICKSTART}#2--add-the-sign-in-popup`,
            });
        } else if (!coop || coop === 'same-origin-allow-popups' || coop === 'unsafe-none') {
            findings.push({
                check: 'Cross-Origin-Opener-Policy',
                verdict: 'pass',
                detail: `${https.final.url} sends ${coop ? `Cross-Origin-Opener-Policy: ${coop}` : 'no Cross-Origin-Opener-Policy'}, so the popup can hand the token back.`,
            });
        } else {
            findings.push({
                check: 'Cross-Origin-Opener-Policy',
                verdict: 'warn',
                detail: `${https.final.url} sends Cross-Origin-Opener-Policy: ${coop}. The docs name only same-origin-allow-popups, or no such header, as working with the popup.`,
                docs: `${QUICKSTART}#2--add-the-sign-in-popup`,
            });
        }
        const csp = https.final.headers.get('content-security-policy');
        if (csp) {
            findings.push({
                check: 'Content-Security-Policy',
                verdict: 'info',
                detail: 'The page sends a Content-Security-Policy. The popup needs no orangecheck origin in connect-src or frame-src; only script-src must allow wherever you serve the popup module.',
                docs: `${QUICKSTART}#2--add-the-sign-in-popup`,
            });
        }
    }

    // Domain verification
    if (domainCheck instanceof Error) {
        findings.push({ check: 'Domain verification', verdict: 'warn', detail: `Not checked: ${domainCheck.message}` });
    } else {
        findings.push(domainFinding(domainCheck, project instanceof Error ? undefined : project));
    }

    // The project, when a key was given
    if (project instanceof Error) {
        findings.push({ check: 'Project', verdict: 'fail', detail: project.message });
    } else if (project) {
        findings.push(...projectFindings(project, origin ? new URL(origin).hostname : domain));
    }

    return {
        site: start.toString(),
        domain,
        ...(origin ? { origin } : {}),
        findings,
        ...(checklist ? { byHand: checklist } : {}),
        byHandSource: `${QUICKSTART}#5--check-it-before-real-people-sign-in`,
    };
}

function domainFinding(c: DomainCheck, project?: ProjectReport): Finding {
    const docs = `${QUICKSTART}#5--go-live`;
    const registered = project?.identity.ok ? project.identity.data : undefined;
    if (registered && registered.domain === c.domain) {
        return registered.verified
            ? { check: 'Domain verification', verdict: 'pass', detail: `me.ochk.io records ${c.domain} as verified for this project.`, docs }
            : {
                  check: 'Domain verification',
                  verdict: 'fail',
                  detail: `me.ochk.io has not verified ${c.domain} for this project. Until it does, the list of ended sessions is refused for it and the SDKs refuse writes from signed-in sessions. ${describeFound(c)}`,
                  docs: `${QUICKSTART}#1--create-a-project`,
              };
    }
    if (c.token) {
        return c.verified
            ? { check: 'Domain verification', verdict: 'pass', detail: `The token is published through ${c.via === 'dns-txt' ? 'the DNS TXT record' : 'the meta tag'}. Press Verify on your project so me.ochk.io records it.`, docs }
            : { check: 'Domain verification', verdict: 'fail', detail: `The token is not published. ${describeFound(c)}`, docs };
    }
    const any = c.dns.ocVerify.length > 0 || c.meta.contents.length > 0;
    return {
        check: 'Domain verification',
        verdict: any ? 'info' : 'warn',
        detail: any
            ? `${describeFound(c)} Give the project key or the token to know whether it is this project's.`
            : `${c.domain} publishes no oc-verify TXT record and no oc-domain-verify meta tag. ${c.meta.hint ?? ''}`.trim(),
        docs,
    };
}

function describeFound(c: DomainCheck): string {
    const bits: string[] = [];
    if (c.dns.ocVerify.length) bits.push(`TXT: ${c.dns.ocVerify.join(', ')}`);
    if (c.meta.contents.length) bits.push(`meta tag: ${c.meta.contents.join(', ')}`);
    if (!bits.length) return `Nothing is published yet.${c.meta.clientRendered ? ' The homepage looks like a single-page app: the tag must be in its static index.html.' : ''}`;
    return `Published: ${bits.join('; ')}.`;
}

function projectFindings(p: ProjectReport, host: string): Finding[] {
    if (p.unknown) {
        return [{ check: 'Project', verdict: 'fail', detail: `No project has the key ${p.projectKey} (me.ochk.io answered 404). Copy it from https://ochk.app/me/projects.` }];
    }
    const out: Finding[] = [];
    const id = p.identity.ok ? p.identity.data : undefined;
    if (!id) {
        out.push({ check: 'Project', verdict: 'warn', detail: `The project's identity could not be read: ${p.identity.problem}` });
    } else {
        if (id.frozen) out.push({ check: 'Project', verdict: 'fail', detail: 'The project is frozen: it signs nobody in.' });
        const covered = host === id.domain || host.endsWith(`.${id.domain}`);
        out.push(
            covered
                ? { check: 'Project domain', verdict: 'pass', detail: `${host} is ${host === id.domain ? 'the project\'s domain' : `a subdomain of the project's domain, ${id.domain}`}.` }
                : {
                      check: 'Project domain',
                      verdict: 'fail',
                      detail: `${host} is not ${id.domain} or a subdomain of it. The list of ended sessions is served only for the verified domain and its subdomains (and a test project's development origin), so tokens for this origin read unverified: sign-in and reads work, writes are refused.`,
                      docs: SDK_ENDED,
                  }
        );
    }
    out.push({
        check: 'Project mode',
        verdict: 'info',
        detail:
            p.mode === 'test'
                ? 'Test project (pk_test_). It records events only for you, its owner: an event for anyone else throws earner_not_project_owner.'
                : 'Live project (pk_live_).',
        docs: `${QUICKSTART}#1--when-you-pay`,
    });
    if (p.signIn.ok && p.signIn.data) {
        const rule = p.signIn.data.require_bond;
        out.push({
            check: 'Who can sign in',
            verdict: 'info',
            detail: rule
                ? `Backed by bitcoin: at least ${rule.min_sats} sats, held at least ${rule.min_days} days. Your server enforces it only when it passes projectKey to withOcAuth (or SignInPolicy in Python).`
                : 'Everyone (the default).',
            docs: 'https://ochk.io/docs/me/require-bond',
        });
    }
    return out;
}

const MARK: Record<Verdict, string> = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', info: 'INFO' };

export function formatSetup(r: SetupReport): string {
    const out: string[] = [`# Sign-in setup: ${r.site}`, ''];
    const fails = r.findings.filter((f) => f.verdict === 'fail').length;
    const warns = r.findings.filter((f) => f.verdict === 'warn').length;
    out.push(
        fails || warns
            ? `${fails} to fix, ${warns} to look at, of the checks that can be made from outside.`
            : 'Nothing to fix among the checks that can be made from outside.'
    );
    out.push('');
    for (const f of r.findings) {
        out.push(`- ${MARK[f.verdict]} ${f.check}: ${f.detail}${f.docs ? ` (${f.docs})` : ''}`);
    }
    out.push('');
    out.push('## By hand');
    out.push(
        `The rest of the quickstart's checklist is about your server and your code, which can't be seen from outside. From ${r.byHandSource}, verbatim:`
    );
    out.push('');
    out.push(r.byHand ? r.byHand.trimEnd() : `(The checklist could not be read just now: open ${r.byHandSource}.)`);
    return out.join('\n');
}
