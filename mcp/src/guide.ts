/** Integration steps for a stack, assembled from the docs as they read now: every block is copied, none written. */

import { pageUrl, type Docs } from './docs.js';
import { blocks, section } from './markdown.js';

export const STACKS = ['nextjs-pages', 'nextjs-app', 'express', 'hono', 'python', 'godot'] as const;
export type Stack = (typeof STACKS)[number];

/** One block to copy: a code block containing `code`, a text block containing `text`, or the whole section. */
type Pick = { code: string } | { text: string } | { all: true };

interface Excerpt {
    page: string;
    section: string;
    picks: Pick[];
}

interface Step {
    title: string;
    excerpts: Excerpt[];
    /** Ours, not the docs': only where the docs leave a gap, and it says so. */
    note?: string;
}

interface Recipe {
    title: string;
    steps: Step[];
}

const QS = '/me/quickstart';
const SDK = '/me/sdk';
const BUTTON = '/integration/sign-in-button';
const NATIVE = '/integration/native-sign-in';

const PROJECT: Step = {
    title: 'Create a project and put its key in your server environment',
    excerpts: [
        {
            page: QS,
            section: '1 · create a project',
            picks: [
                { code: 'name:    Your App' },
                { text: 'A new project starts in test mode' },
                { text: '**Refusing sessions people ended everywhere.**' },
                { text: 'For a project that only signs people in' },
            ],
        },
    ],
};
const INSTALL: Step = {
    title: 'Install the client',
    excerpts: [
        {
            page: QS,
            section: '2 · add the sign-in popup',
            picks: [{ code: 'npm install @orangecheck/me-client' }, { text: 'If your own session replaces the token' }],
        },
    ],
};
const POPUP: Step = {
    title: 'Open the sign-in popup from a click and post the token to your server',
    excerpts: [
        {
            page: QS,
            section: '2 · add the sign-in popup',
            picks: [{ text: 'inside a click handler, or the browser blocks the popup' }, { code: "import { signInWithOc } from '@orangecheck/me-client/popup'" }],
        },
    ],
};
const POPUP_NO_BUNDLER: Step = {
    title: 'Serve the popup module yourself and open it from a click',
    excerpts: [
        {
            page: QS,
            section: '2 · add the sign-in popup',
            picks: [
                { text: 'No bundler?' },
                { text: 'inside a click handler, or the browser blocks the popup' },
                { code: "import { signInWithOc } from '@orangecheck/me-client/popup'" },
            ],
        },
    ],
};
const BUTTON_REACT: Step = {
    title: 'The sign-in button (React)',
    excerpts: [{ page: BUTTON, section: 'React', picks: [{ code: 'import type { ReactElement }' }] }],
};
const BUTTON_CDN: Step = {
    title: 'The sign-in button, from a CDN',
    excerpts: [{ page: BUTTON, section: 'From a CDN', picks: [{ code: '<link' }] }],
};
const COOKIE_PAGES: Step = {
    title: 'Keep the token in an httpOnly cookie',
    excerpts: [
        {
            page: QS,
            section: '2 · add the sign-in popup',
            picks: [{ text: 'Your server keeps the token in an httpOnly cookie' }, { code: 'pages/api/auth/session.ts' }, { text: 'On Express or Hono it is the same three moves' }],
        },
    ],
};
const AUDIENCE: Excerpt = { page: QS, section: '3 · check the session on your server', picks: [{ text: '`audience` is the origin of the page that opened the popup' }] };
const CHECK_PAGES: Step = {
    title: 'Check the session on every request',
    excerpts: [{ page: QS, section: '3 · check the session on your server', picks: [{ code: 'pages/api/auth/me.ts' }] }, AUDIENCE],
};
const CHECK_EXPRESS: Step = {
    title: 'Check the session on every request',
    excerpts: [{ page: QS, section: '3 · check the session on your server', picks: [{ code: 'ocAuthExpress' }] }, AUDIENCE],
};
const CHECK_HONO: Step = {
    title: 'Check the session on every request',
    excerpts: [{ page: QS, section: '3 · check the session on your server', picks: [{ code: 'ocAuthHono' }] }, AUDIENCE],
};
const WHO: Step = {
    title: 'Choose who can sign in',
    excerpts: [{ page: QS, section: '4 · choose who can sign in', picks: [{ all: true }] }],
};
const VERIFY: Step = {
    title: 'Verify your domain',
    excerpts: [
        { page: QS, section: '5 · go live', picks: [{ code: 'oc-verify=<token>' }, { text: 'The check reads the HTML your server sends' }] },
    ],
};
const CHECKLIST: Step = {
    title: 'Check it before real people sign in',
    excerpts: [{ page: QS, section: '5 · check it before real people sign in', picks: [{ all: true }] }],
};

const RECIPES: Record<Stack, Recipe> = {
    'nextjs-pages': {
        title: 'Next.js (Pages Router)',
        steps: [PROJECT, INSTALL, POPUP, BUTTON_REACT, COOKIE_PAGES, CHECK_PAGES, WHO, VERIFY, CHECKLIST],
    },
    'nextjs-app': {
        title: 'Next.js (App Router)',
        steps: [
            PROJECT,
            INSTALL,
            POPUP,
            BUTTON_REACT,
            {
                ...COOKIE_PAGES,
                note: 'The docs have no App Router example. Next.js serves pages/api routes in an App Router project too, so the Pages Router routes from the quickstart below work unchanged. withOcAuth, ocAuthExpress and ocAuthHono are the documented ways to enforce who can sign in.',
            },
            CHECK_PAGES,
            {
                title: 'The framework-agnostic primitive',
                excerpts: [{ page: SDK, section: 'checking the session on your server', picks: [{ text: '`getOcSession(headers)` is the framework-agnostic primitive' }] }],
            },
            WHO,
            VERIFY,
            CHECKLIST,
        ],
    },
    express: {
        title: 'Express',
        steps: [PROJECT, INSTALL, POPUP, COOKIE_PAGES, CHECK_EXPRESS, WHO, VERIFY, CHECKLIST],
    },
    hono: {
        title: 'Hono (Bun, Deno)',
        steps: [PROJECT, INSTALL, POPUP, COOKIE_PAGES, CHECK_HONO, WHO, VERIFY, CHECKLIST],
    },
    python: {
        title: 'Python',
        steps: [
            PROJECT,
            POPUP_NO_BUNDLER,
            BUTTON_CDN,
            {
                title: 'Install the Python SDK',
                excerpts: [{ page: '/sdk/python', section: 'Install', picks: [{ code: 'pip install orangecheck' }] }],
            },
            {
                title: 'Check the token on your server',
                excerpts: [
                    {
                        page: SDK,
                        section: 'checking the session on your server',
                        picks: [
                            { code: 'from orangecheck import BondRequired' },
                            { text: '`BondRequired` and `SessionEnded` are both' },
                            { code: 'check_oc_session(bearer' },
                            { text: 'The Python SDK has no framework wrapper' },
                        ],
                    },
                ],
                note: 'The docs show no Python route that sets the session cookie. The quickstart\'s three moves apply: check the token, set the cookie, answer ok. The Django, FastAPI and Flask examples on the Python SDK page gate on OC Attest stake with check(), not on ochk.app sign-in.',
            },
            {
                title: 'A complete Python site to compare with',
                excerpts: [{ page: '/integration/reference', section: 'Run the whole funnel yourself', picks: [{ text: 'is the whole onboarding funnel as small sites' }, { text: 'python-fastapi/' }] }],
            },
            WHO,
            VERIFY,
            CHECKLIST,
        ],
    },
    godot: {
        title: 'Godot 4 (native sign-in through the player\'s browser)',
        steps: [
            PROJECT,
            { title: 'Turn on sign-in from apps', excerpts: [{ page: NATIVE, section: 'Turn it on', picks: [{ all: true }] }] },
            {
                title: 'The game: one script',
                excerpts: [{ page: NATIVE, section: 'The app: Godot 4', picks: [{ code: 'class_name OrangecheckSignIn' }, { code: '_on_code_received' }] }],
            },
            {
                title: 'The button in the game',
                excerpts: [{ page: BUTTON, section: 'Native apps and games', picks: [{ code: 'var button := Button.new()' }] }],
            },
            { title: 'Your server trades the code (Node)', excerpts: [{ page: NATIVE, section: 'Your server: Node', picks: [{ all: true }] }] },
            { title: 'Or your server in Python', excerpts: [{ page: NATIVE, section: 'Your server: Python', picks: [{ all: true }] }] },
            {
                title: 'What comes back',
                excerpts: [{ page: NATIVE, section: 'What comes back', picks: [{ text: 'Start a session only from `valid`' }, { text: 'The token is the popup\'s' }] }],
            },
            WHO,
            CHECKLIST,
        ],
    },
};

const flat = (s: string) => s.replace(/\s+/g, ' ');

export interface Guide {
    stack: Stack;
    text: string;
    /** Excerpts the docs no longer have where this guide expects them. */
    missing: string[];
    pages: string[];
}

export async function buildGuide(docs: Docs, stack: Stack): Promise<Guide> {
    const recipe = RECIPES[stack];
    const routes = [...new Set(recipe.steps.flatMap((s) => s.excerpts.map((e) => e.page)))];
    const loaded = new Map<string, Awaited<ReturnType<Docs['page']>> | Error>();
    await Promise.all(
        routes.map(async (r) => {
            loaded.set(r, await docs.page(r).catch((err: Error) => err));
        })
    );
    const missing: string[] = [];
    const out: string[] = [
        `# Sign in with orangecheck: ${recipe.title}`,
        '',
        'Assembled from the orangecheck docs, read just now. Every block under a Source line is copied from that page as it reads today; nothing in them is written for this guide. A "Note" is the only text that is not from the docs.',
        '',
    ];
    recipe.steps.forEach((step, i) => {
        out.push(`## ${i + 1}. ${step.title}`, '');
        if (step.note) out.push(`Note: ${step.note}`, '');
        for (const ex of step.excerpts) {
            const page = loaded.get(ex.page)!;
            if (page instanceof Error) {
                missing.push(`${pageUrl(ex.page)}: ${page.message}`);
                out.push(`> Could not read ${pageUrl(ex.page)}: ${page.message}`, '');
                continue;
            }
            const sec = section(page.markdown, ex.section);
            if (!sec) {
                missing.push(`${page.url}: section "${ex.section}"`);
                out.push(`> ${page.url} has no section "${ex.section}" any more. Read the page itself: ${page.url}`, '');
                continue;
            }
            const anchor = `${page.url}#${sec.heading.slug}`;
            out.push(`Source: ${anchor}`, '');
            const bs = blocks(sec.markdown);
            for (const pick of ex.picks) {
                if ('all' in pick) {
                    out.push(sec.markdown.split('\n').slice(1).join('\n').trim(), '');
                    continue;
                }
                const found =
                    'code' in pick
                        ? bs.find((b) => b.kind === 'code' && b.code!.includes(pick.code))
                        : bs.find((b) => b.kind === 'text' && flat(b.raw).includes(flat(pick.text)));
                if (!found) {
                    const what = 'code' in pick ? `a code block with "${pick.code}"` : `the passage "${pick.text}"`;
                    missing.push(`${anchor}: ${what}`);
                    out.push(`> ${anchor} no longer has ${what}. Read that section instead.`, '');
                    continue;
                }
                out.push(found.raw, '');
            }
        }
    });
    out.push('## Next', '');
    out.push('- Run check_setup with your site (and project key) once it is deployed.');
    out.push(`- Errors and edge cases: ${pageUrl('/me/integrations')}#errors-and-edge-cases`);
    out.push(`- Every export, with types: ${pageUrl(SDK)}`);
    if (missing.length) {
        out.unshift(
            `WARNING: ${missing.length} excerpt${missing.length === 1 ? '' : 's'} could not be found in the docs as they read now. Those steps say so; read their pages rather than filling the gap.`,
            ''
        );
    }
    return { stack, text: out.join('\n').trimEnd() + '\n', missing, pages: routes.map(pageUrl) };
}
