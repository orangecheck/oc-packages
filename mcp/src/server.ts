import { McpServer, ResourceTemplate, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { checkDomain, defaultLookup, formatDomainCheck, type Lookup, type Pin } from './domain.js';
import { Docs, DOCS_URL, LLMS_URL, mdUrl, pageUrl, parsePageRef, readPart, search } from './docs.js';
import { buildGuide, STACKS } from './guide.js';
import { UpstreamError, VERSION, type FetchLike } from './http.js';
import { pinnedFetch } from './pinned.js';
import { formatProject, readProject } from './project.js';
import { checkSetup, formatSetup } from './setup.js';

export interface ServerOptions {
    fetch?: FetchLike;
    lookup?: Lookup;
    /** How a site the user names is fetched: by default over a connection to the addresses lookup checked. */
    pin?: Pin;
    /** Shared across servers in tests; one per process otherwise. */
    docs?: Docs;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] });

/** A failure as a tool result the model can act on: what failed, and what to do instead. */
function failure(err: unknown, fallback?: string): CallToolResult {
    let msg: string;
    if (err instanceof UpstreamError) {
        msg = err.message;
        if (err.failure === 'timeout' || err.failure === 'network' || (err.status ?? 0) >= 500) {
            msg += ' It may be down or unreachable from here; try again in a minute.';
        }
    } else msg = err instanceof Error ? err.message : String(err);
    if (fallback) msg += ` ${fallback}`;
    return { content: [{ type: 'text', text: msg }], isError: true };
}

const DOCS_DOWN = `Until it answers, open ${DOCS_URL} in a browser. Don't write orangecheck code from memory: the docs are the source.`;

export function createServer(opts: ServerOptions = {}): McpServer {
    const fetchImpl: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
    const lookup = opts.lookup ?? defaultLookup;
    const pin = opts.pin ?? pinnedFetch;
    const docs = opts.docs ?? new Docs({ fetch: fetchImpl });

    const server = new McpServer(
        { name: 'orangecheck', version: VERSION, title: 'orangecheck' },
        {
            instructions:
                'Tools for integrating orangecheck sign-in (ochk.app, me.ochk.io) and reading its docs at ochk.io/docs. ' +
                'Write orangecheck code only from what search_docs, read_doc and integration_guide return, and cite the page. ' +
                'Use check_setup and check_domain_verification on a deployed site, and get_project_config to read a project by its key. ' +
                'Nothing here needs a credential, and nothing here changes an account.',
        }
    );

    server.registerTool(
        'search_docs',
        {
            title: 'Search the orangecheck docs',
            description:
                'Full-text search over every written page of the orangecheck docs (ochk.io/docs/llms-full.txt), plus the SDK reference titles. Returns the best pages with their URLs and the matching lines, each with its section anchor. Follow up with read_doc.',
            inputSchema: z.object({
                query: z.string().min(1).describe('Words to find, e.g. "withOcAuth audience" or "domain verification".'),
                limit: z.number().int().min(1).max(20).optional().describe('How many pages to return (default 8).'),
            }),
            annotations: READ_ONLY,
        },
        async ({ query, limit }) => {
            try {
                const [pages, index] = await Promise.all([docs.pages(), docs.index()]);
                const hits = search(pages, index, query, limit ?? 8);
                if (hits.length === 0) {
                    return text(`No docs page mentions "${query}". Try fewer or other words, or list_docs for every page.`);
                }
                const out = [`${hits.length} page${hits.length === 1 ? '' : 's'} for "${query}":`, ''];
                hits.forEach((h, i) => {
                    out.push(`${i + 1}. ${h.title}`);
                    out.push(`   ${h.url}`);
                    if (h.description) out.push(`   ${h.description}`);
                    for (const m of h.matches) out.push(`   - ${m.line}${m.anchor ? `  (${h.url}#${m.anchor})` : ''}`);
                    out.push('');
                });
                return text(out.join('\n').trimEnd());
            } catch (err) {
                return failure(err, DOCS_DOWN);
            }
        }
    );

    server.registerTool(
        'list_docs',
        {
            title: 'List the orangecheck docs',
            description:
                'Every docs page with its one-line description, from ochk.io/docs/llms.txt, grouped by section (/docs/me, /docs/integration, ...). Pass a section to list only that one.',
            inputSchema: z.object({
                section: z.string().optional().describe('A section to list, e.g. "me", "/docs/integration", "sdk" or "Optional" (the SDK reference).'),
            }),
            annotations: READ_ONLY,
        },
        async ({ section }) => {
            try {
                const index = await docs.index();
                const want = section?.trim().toLowerCase().replace(/^\/?(docs\/?)?/, '').replace(/\/$/, '');
                const groups = [...new Set(index.map((e) => e.group))];
                const chosen = want
                    ? groups.filter((g) => g.toLowerCase() === want || g.toLowerCase().replace(/^\/docs\/?/, '') === want)
                    : groups;
                if (chosen.length === 0) {
                    return text(`No section "${section}". The sections: ${groups.join(', ')}.`);
                }
                const out: string[] = [];
                for (const g of chosen) {
                    out.push(`## ${g}`, '');
                    for (const e of index.filter((x) => x.group === g)) {
                        out.push(`- ${e.title}: ${e.url}${e.description ? `\n  ${e.description}` : ''}`);
                    }
                    out.push('');
                }
                return text(out.join('\n').trimEnd());
            } catch (err) {
                return failure(err, DOCS_DOWN);
            }
        }
    );

    server.registerTool(
        'read_doc',
        {
            title: 'Read an orangecheck docs page',
            description:
                'One docs page as markdown (its .md copy), or one section of it. Takes a URL or a path, with or without #anchor: https://ochk.io/docs/me/quickstart#5--go-live, /me/sdk, integration/native-sign-in. Long pages come in parts: call again with the offset it gives.',
            inputSchema: z.object({
                page: z.string().min(1).describe('The page: a URL under https://ochk.io/docs, or a path such as /me/quickstart. An #anchor reads that section.'),
                section: z.string().optional().describe('A heading or anchor to read only that section, e.g. "3 · check the session on your server" or "when-someone-ends-every-session".'),
                offset: z.number().int().min(0).optional().describe('Where to start, for the next part of a long page.'),
                max_chars: z.number().int().min(1000).max(100_000).optional().describe('Most characters in one part (default 24000).'),
            }),
            annotations: READ_ONLY,
        },
        async ({ page, section, offset, max_chars }) => {
            let ref: { route: string; anchor?: string };
            try {
                ref = parsePageRef(page);
            } catch (err) {
                return failure(err);
            }
            try {
                const p = await docs.page(ref.route);
                const part = readPart(p, { section: section ?? ref.anchor, offset, maxChars: max_chars });
                const head = `Source: ${p.url}${section || ref.anchor ? `#${(section ?? ref.anchor)!.replace(/^#/, '')}` : ''} (${mdUrl(ref.route)})`;
                const tail = part.nextOffset !== undefined
                    ? `\n\n[${part.total - part.nextOffset} more characters: call read_doc again with offset=${part.nextOffset}.]`
                    : '';
                return text(`${head}\n\n${part.text.trimEnd()}${tail}`);
            } catch (err) {
                return failure(err, err instanceof UpstreamError ? DOCS_DOWN : undefined);
            }
        }
    );

    server.registerTool(
        'get_project_config',
        {
            title: "Read a project's public config",
            description:
                "Everything me.ochk.io publishes about a project, by its key (pk_test_… or pk_live_…): name, domain and whether it is verified, frozen, who can sign in, sign-in from apps, and the published prices, pay periods and release schedules. No credential: these endpoints are public.",
            inputSchema: z.object({
                project_key: z.string().min(1).describe('The project key, pk_test_… or pk_live_…, from the project\'s Keys & webhooks tab at ochk.app.'),
            }),
            annotations: READ_ONLY,
        },
        async ({ project_key }) => {
            try {
                const report = await readProject(fetchImpl, project_key);
                const parts = [report.identity, report.signIn, report.native, report.config];
                if (!report.unknown && parts.every((p) => !p.ok)) {
                    return failure(new Error(`me.ochk.io could not be read: ${parts.map((p) => p.problem).join(' ')}`), 'Try again in a minute.');
                }
                return text(formatProject(report));
            } catch (err) {
                return failure(err);
            }
        }
    );

    server.registerTool(
        'check_domain_verification',
        {
            title: "Check a domain's verification record",
            description:
                "Reads what me.ochk.io's domain check reads: the TXT record oc-verify=<token> (through Cloudflare's DNS-over-HTTPS), and the <meta name=\"oc-domain-verify\"> tag in the HTML https://<domain>/ sends, following redirects only to the domain or its www twin. With the token, says whether it is published; without, lists what is.",
            inputSchema: z.object({
                domain: z.string().min(1).describe('The domain, e.g. yourapp.example, or the site\'s https:// URL.'),
                token: z.string().optional().describe('The verification token from your project at ochk.app, with or without "oc-verify=".'),
            }),
            annotations: READ_ONLY,
        },
        async ({ domain, token }) => {
            try {
                return text(formatDomainCheck(await checkDomain({ fetch: fetchImpl, lookup, pin }, domain, token)));
            } catch (err) {
                return failure(err);
            }
        }
    );

    server.registerTool(
        'check_setup',
        {
            title: 'Check a site against the sign-in checklist',
            description:
                "Runs the quickstart's \"check it before real people sign in\" against a deployed site, as far as it can be checked from outside: HTTPS, http:// redirecting to https://, www and the apex ending on one origin (your audience), the Cross-Origin-Opener-Policy the popup needs, the domain's verification record, and with a project key, that the site is on the project's domain. Then lists, verbatim, the checklist items only your code can show.",
            inputSchema: z.object({
                site: z.string().min(1).describe('The site, e.g. https://yourapp.example, or the page your sign-in button is on.'),
                project_key: z.string().optional().describe('The project key (pk_test_… or pk_live_…), to check the site against the project.'),
                token: z.string().optional().describe('The domain verification token, if the project key is not given.'),
            }),
            annotations: READ_ONLY,
        },
        async ({ site, project_key, token }) => {
            try {
                return text(formatSetup(await checkSetup({ fetch: fetchImpl, lookup, pin, docs }, { site, projectKey: project_key, token })));
            } catch (err) {
                return failure(err);
            }
        }
    );

    server.registerTool(
        'integration_guide',
        {
            title: 'Integration steps for a stack',
            description:
                'The steps to add "Sign in with orangecheck" to a stack, assembled from the docs as they read now: every code block is copied verbatim from the page cited above it, never generated. Stacks: nextjs-pages, nextjs-app, express, hono, python, godot (native sign-in through the player\'s browser).',
            inputSchema: z.object({
                stack: z.enum(STACKS).describe('The stack to integrate.'),
            }),
            annotations: READ_ONLY,
        },
        async ({ stack }) => {
            try {
                const guide = await buildGuide(docs, stack);
                return text(guide.text);
            } catch (err) {
                return failure(err, DOCS_DOWN);
            }
        }
    );

    server.registerResource(
        'docs-index',
        'orangecheck://docs/llms.txt',
        { title: 'orangecheck docs index', description: `Every docs page, from ${LLMS_URL}.`, mimeType: 'text/plain' },
        async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: await docs.indexText() }] })
    );

    server.registerResource(
        'docs-page',
        new ResourceTemplate('orangecheck://docs/{+route}', { list: undefined }),
        { title: 'orangecheck docs page', description: 'A docs page as markdown, e.g. orangecheck://docs/me/quickstart.', mimeType: 'text/markdown' },
        async (uri, variables) => {
            const raw = Array.isArray(variables.route) ? variables.route.join('/') : String(variables.route ?? '');
            const { route } = parsePageRef(`/${raw}`);
            const p = await docs.page(route);
            return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: `Source: ${pageUrl(route)}\n\n${p.markdown}` }] };
        }
    );

    server.registerPrompt(
        'set_up_sign_in',
        {
            title: 'Set up sign in with orangecheck',
            description: 'Walk the quickstart for a stack: steps from the docs, then the checks once the site is deployed.',
            argsSchema: z.object({
                stack: z.string().describe(`One of: ${STACKS.join(', ')}.`),
                site: z.string().optional().describe('Your site, e.g. https://yourapp.example.'),
                project_key: z.string().optional().describe('Your project key, if you have one.'),
            }),
        },
        ({ stack, site, project_key }) => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: [
                            `Add "Sign in with orangecheck" to this ${stack} project, following the orangecheck docs exactly.`,
                            '',
                            `1. Call integration_guide with stack "${stack}" and follow its steps in order. Use its code blocks as they are, adapting only names, paths and the audience origin; cite the Source line for each file you write. If a step says an excerpt is missing, read that page with read_doc instead of guessing.`,
                            project_key
                                ? `2. Call get_project_config with ${project_key} and check the project's domain, mode and who can sign in against what you build.`
                                : '2. If there is no project yet, tell me to create one at https://ochk.app/me/projects/new and put its key in the server environment as OC_PROJECT_KEY. Never put a signing secret in client code or in this conversation.',
                            '3. Look up anything else with search_docs and read_doc before writing it. Do not write orangecheck code from memory.',
                            site
                                ? `4. Once it is deployed, run check_setup on ${site}${project_key ? ` with project_key ${project_key}` : ''}, fix what it reports, and go through its "By hand" list with me item by item.`
                                : '4. Once it is deployed, run check_setup on the site and go through its "By hand" list with me item by item.',
                        ].join('\n'),
                    },
                },
            ],
        })
    );

    server.registerPrompt(
        'pre_launch_check',
        {
            title: 'Check a site before real people sign in',
            description: "Run check_setup on a deployed site, then walk the quickstart's checklist against the code.",
            argsSchema: z.object({
                site: z.string().describe('The deployed site, e.g. https://yourapp.example.'),
                project_key: z.string().optional().describe('The project key, pk_test_… or pk_live_….'),
            }),
        },
        ({ site, project_key }) => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: [
                            `Run check_setup on ${site}${project_key ? ` with project_key ${project_key}` : ''} and report what it finds.`,
                            'Then go through every item of its "By hand" list against this codebase: for each, quote the code that satisfies it, or say plainly that nothing does and what the docs page it links says to do. Read the linked pages with read_doc rather than relying on memory.',
                        ].join('\n'),
                    },
                },
            ],
        })
    );

    return server;
}
