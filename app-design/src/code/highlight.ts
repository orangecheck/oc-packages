/*
 * Syntax highlighting with no dependency and no async step, so code is
 * coloured in the server's HTML: at build time in the docs (rehypeCode), and
 * in a page's own render for code made at run time (an envelope, an install
 * line). It reads the languages the family writes: TypeScript and JavaScript
 * (with JSX), JSON, shell, Python, YAML and diffs. Anything else is shown as
 * plain text, never guessed at.
 *
 * Each token names a kind; the kind is a class, and the class is a colour in
 * tokens.css (--oca-code-*). One palette for every highlighter: the shiki
 * theme in ./theme maps TextMate scopes onto the same variables.
 */

export type TokenKind =
    | 'keyword'
    | 'string'
    | 'number'
    | 'function'
    | 'type'
    | 'property'
    | 'comment'
    | 'tag'
    | 'url';

export interface Token {
    text: string;
    kind?: TokenKind;
}

/** One line of code, as tokens. */
export type CodeLine = Token[];

/** The class each kind is drawn with (styles/code.css). */
export const TOKEN_CLASS: Record<TokenKind, string> = {
    keyword: 'oca-k',
    string: 'oca-s',
    number: 'oca-n',
    function: 'oca-f',
    type: 'oca-y',
    property: 'oca-p',
    comment: 'oca-c',
    tag: 'oca-g',
    url: 'oca-u',
};

type Grammar = 'js' | 'json' | 'shell' | 'python' | 'yaml' | 'diff' | 'plain';

const ALIASES: Record<string, Grammar> = {
    ts: 'js',
    typescript: 'js',
    tsx: 'js',
    js: 'js',
    javascript: 'js',
    jsx: 'js',
    mjs: 'js',
    cjs: 'js',
    json: 'json',
    jsonc: 'json',
    json5: 'json',
    bash: 'shell',
    sh: 'shell',
    shell: 'shell',
    zsh: 'shell',
    console: 'shell',
    terminal: 'shell',
    py: 'python',
    python: 'python',
    yaml: 'yaml',
    yml: 'yaml',
    diff: 'diff',
};

/** The languages read, by the names a code fence uses. */
export const CODE_LANGS: readonly string[] = Object.keys(ALIASES);

export function grammarOf(lang?: string | null): Grammar {
    return (lang && ALIASES[lang.toLowerCase()]) || 'plain';
}

/* ── Scanner ─────────────────────────────────────────────────────────── */

type Emit = (text: string, kind?: TokenKind) => void;

/** Collects tokens, merging neighbours of one kind so the markup stays small. */
function collector(): { emit: Emit; tokens: Token[] } {
    const tokens: Token[] = [];
    const emit: Emit = (text, kind) => {
        if (!text) return;
        const last = tokens[tokens.length - 1];
        if (last && last.kind === kind) last.text += text;
        else tokens.push(kind ? { text, kind } : { text });
    };
    return { emit, tokens };
}

function at(re: RegExp, src: string, i: number): string | null {
    re.lastIndex = i;
    const m = re.exec(src);
    return m ? m[0] : null;
}

const WS = /[ \t]+/y;
const NEWLINE = /\r?\n/y;

/* ── JavaScript, TypeScript, JSX ─────────────────────────────────────── */

const JS_KEYWORDS = new Set(
    (
        'abstract as async await break case catch class const continue debugger declare default delete do else enum export ' +
        'extends finally for from function get if implements import in infer instanceof interface is keyof let module ' +
        'namespace new of override private protected public readonly return satisfies set static super switch this throw ' +
        'try type typeof unique var void while with yield'
    ).split(' ')
);
const JS_CONSTANTS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
const TS_PRIMITIVES = new Set(['string', 'number', 'boolean', 'bigint', 'symbol', 'object', 'unknown', 'any', 'never']);

/* MAX_SATS, DOCS_HREF: a constant. JSON, URL: a namespace, read as a type. */
const isConstant = (m: string) => /^[A-Z][A-Z\d_]+$/.test(m) && (m.includes('_') || m.length > 4);

const JS_LINE_COMMENT = /\/\/[^\n]*/y;
const JS_BLOCK_COMMENT = /\/\*[\s\S]*?(?:\*\/|$)/y;
const JS_TEMPLATE = /`(?:\\[\s\S]|[^\\`])*`?/y;
const JS_STRING = /'(?:\\.|[^\\'\n])*'?|"(?:\\.|[^\\"\n])*"?/y;
const JS_NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)n?/y;
const JS_IDENT = /[A-Za-z_$][\w$]*/y;
const JS_DECORATOR = /@[A-Za-z_$][\w$.]*/y;
const JS_CALL_AFTER = /\s*(?:<[\w$\s,.[\]|&'"]*>)?\s*\(/y;
const JS_TAG = /<\/?(?=[A-Za-z])/y;
const JS_TAG_NAME = /[A-Za-z][\w$.:-]*/y;
const JS_PUNCT = /=>|\.\.\.|[{}()[\];,.<>=+\-*/%!?:&|^~#]/y;
/* Where a JSX tag can start: after one of these, or at the start of a line. */
const JSX_BEFORE = new Set(['(', ',', '=', '?', ':', '{', '[', ';', '>', '&&', '||', '=>', 'return']);

function scanJs(src: string, emit: Emit, jsx: boolean) {
    let i = 0;
    let prev = ''; // the last significant token, for property access and JSX starts
    let tagDepth = 0; // inside <Tag …> before its >
    let braceInTag = 0; // a {…} expression inside a tag's attributes
    const sig = (t: string) => {
        prev = t;
    };
    while (i < src.length) {
        let m: string | null;
        if ((m = at(WS, src, i)) || (m = at(NEWLINE, src, i))) {
            emit(m);
            i += m.length;
            continue;
        }
        if ((m = at(JS_LINE_COMMENT, src, i)) || (m = at(JS_BLOCK_COMMENT, src, i))) {
            emit(m, 'comment');
            i += m.length;
            continue;
        }
        if ((m = at(JS_TEMPLATE, src, i)) || (m = at(JS_STRING, src, i))) {
            emit(m, 'string');
            i += m.length;
            sig('"');
            continue;
        }
        if (jsx && tagDepth === 0 && (m = at(JS_TAG, src, i)) && (prev === '' || JSX_BEFORE.has(prev))) {
            const name = at(JS_TAG_NAME, src, i + m.length);
            if (name) {
                emit(m);
                emit(name, 'tag');
                i += m.length + name.length;
                tagDepth = 1;
                braceInTag = 0;
                sig('tag');
                continue;
            }
        }
        if (jsx && tagDepth > 0 && braceInTag === 0) {
            if (src.startsWith('/>', i) || src[i] === '>') {
                const close = src[i] === '>' ? '>' : '/>';
                emit(close);
                i += close.length;
                tagDepth = 0;
                sig('>');
                continue;
            }
            if ((m = at(JS_IDENT, src, i)) && /^\s*=/.test(src.slice(i + m.length, i + m.length + 4))) {
                emit(m, 'property');
                i += m.length;
                continue;
            }
            if ((m = at(JS_IDENT, src, i))) {
                emit(m, 'property');
                i += m.length;
                continue;
            }
            if (src[i] === '{') braceInTag = 1;
        } else if (jsx && tagDepth > 0 && braceInTag > 0) {
            if (src[i] === '{') braceInTag++;
            else if (src[i] === '}') braceInTag--;
        }
        if ((m = at(JS_DECORATOR, src, i))) {
            emit(m, 'function');
            i += m.length;
            sig('@');
            continue;
        }
        if ((m = at(JS_IDENT, src, i))) {
            const end = i + m.length;
            let kind: TokenKind | undefined;
            if (prev !== '.' && JS_CONSTANTS.has(m)) kind = 'number';
            else if (prev !== '.' && JS_KEYWORDS.has(m)) kind = 'keyword';
            else if (at(JS_CALL_AFTER, src, end) !== null) kind = 'function';
            else if (prev !== '.' && TS_PRIMITIVES.has(m)) kind = 'type';
            else if (isConstant(m)) kind = 'number';
            else if (/^[A-Z]/.test(m)) kind = 'type';
            emit(m, kind);
            i = end;
            sig(kind === 'keyword' ? m : 'id');
            continue;
        }
        if ((m = at(JS_NUMBER, src, i))) {
            emit(m, 'number');
            i += m.length;
            sig('0');
            continue;
        }
        if ((m = at(JS_PUNCT, src, i))) {
            emit(m);
            i += m.length;
            sig(m === '.' ? '.' : m);
            continue;
        }
        emit(src[i]!);
        i++;
    }
}

/* ── JSON ────────────────────────────────────────────────────────────── */

const JSON_STRING = /"(?:\\.|[^\\"\n])*"?/y;
const JSON_KEY_AFTER = /\s*:/y;
const JSON_NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const JSON_WORD = /true|false|null/y;

function scanJson(src: string, emit: Emit) {
    let i = 0;
    while (i < src.length) {
        let m: string | null;
        if ((m = at(JS_LINE_COMMENT, src, i)) || (m = at(JS_BLOCK_COMMENT, src, i))) {
            emit(m, 'comment');
        } else if ((m = at(JSON_STRING, src, i))) {
            emit(m, at(JSON_KEY_AFTER, src, i + m.length) !== null ? 'property' : 'string');
        } else if ((m = at(JSON_NUMBER, src, i)) || (m = at(JSON_WORD, src, i))) {
            emit(m, 'number');
        } else {
            m = src[i]!;
            emit(m);
        }
        i += m.length;
    }
}

/* ── Shell ───────────────────────────────────────────────────────────── */

const SH_KEYWORDS = new Set(
    'if then else elif fi for in do done case esac while until function return export local select time'.split(' ')
);
const SH_PROMPT = /\$ (?=\S)/y;
const SH_COMMENT = /#[^\n]*/y;
const SH_SINGLE = /'[^']*'?/y;
const SH_DOUBLE = /"(?:\\.|[^\\"])*"?/y;
const SH_VAR = /\$(?:\{[^}\n]*\}?|[A-Za-z_][\w]*|[@*#?$!\d])/y;
const SH_URL = /https?:\/\/[^\s'"`)]+/y;
const SH_FLAG = /--?[A-Za-z][\w-]*/y;
const SH_ASSIGN = /[A-Za-z_][\w]*(?==)/y;
const SH_VALUE = /=[^\s|&;()<>'"`$]*/y;
const SH_WORD = /[^\s|&;()<>'"`$#]+/y;
const SH_OPERATOR = /\|\||&&|[|;&]|\$\(|[()<>]/y;

function scanShell(src: string, emit: Emit) {
    let i = 0;
    let command = true; // the next word is a command
    let lineStart = true;
    while (i < src.length) {
        let m: string | null;
        if ((m = at(NEWLINE, src, i))) {
            emit(m);
            i += m.length;
            // A trailing backslash continues the command on the next line.
            command = !/\\\s*$/.test(src.slice(0, i - m.length));
            lineStart = true;
            continue;
        }
        if ((m = at(WS, src, i))) {
            emit(m);
            i += m.length;
            continue;
        }
        if (lineStart && (m = at(SH_PROMPT, src, i))) {
            emit(m, 'comment');
            i += m.length;
            lineStart = false;
            continue;
        }
        lineStart = false;
        // A # starts a comment at the start of a word, not inside one (url#frag).
        if ((m = at(SH_COMMENT, src, i)) && (i === 0 || /\s/.test(src[i - 1]!))) {
            emit(m, 'comment');
            i += m.length;
            continue;
        }
        if ((m = at(SH_SINGLE, src, i)) || (m = at(SH_DOUBLE, src, i))) {
            emit(m, 'string');
            i += m.length;
            command = false;
            continue;
        }
        if ((m = at(SH_OPERATOR, src, i))) {
            emit(m);
            i += m.length;
            command = m !== ')' && m !== '>' && m !== '<';
            continue;
        }
        if ((m = at(SH_VAR, src, i))) {
            emit(m, 'type');
            i += m.length;
            command = false;
            continue;
        }
        if ((m = at(SH_URL, src, i))) {
            emit(m, 'url');
            i += m.length;
            command = false;
            continue;
        }
        if (command && (m = at(SH_ASSIGN, src, i))) {
            // FOO=bar cmd: the name, then its value; the command comes after.
            emit(m, 'property');
            i += m.length;
            const v = at(SH_VALUE, src, i)!;
            emit(v);
            i += v.length;
            continue;
        }
        if ((m = at(SH_FLAG, src, i)) && !command) {
            emit(m, 'keyword');
            i += m.length;
            continue;
        }
        if ((m = at(SH_WORD, src, i))) {
            if (command && SH_KEYWORDS.has(m)) emit(m, 'keyword');
            else if (command) {
                emit(m, 'function');
                // `sudo npm …`, `npx tsx …`: the next word is the real command.
                command = m === 'sudo' || m === 'npx' || m === 'env' || m === 'time';
                i += m.length;
                continue;
            } else emit(m);
            i += m.length;
            continue;
        }
        emit(src[i]!);
        i++;
    }
}

/* ── Python ──────────────────────────────────────────────────────────── */

const PY_KEYWORDS = new Set(
    (
        'and as assert async await break class continue def del elif else except finally for from global if import in is ' +
        'lambda match case nonlocal not or pass raise return try while with yield self cls'
    ).split(' ')
);
const PY_CONSTANTS = new Set(['True', 'False', 'None']);
const PY_TYPES = new Set(['int', 'str', 'bool', 'float', 'bytes', 'list', 'dict', 'tuple', 'set', 'object']);
const PY_COMMENT = /#[^\n]*/y;
const PY_TRIPLE = /[rRbBuUfF]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/y;
const PY_STRING = /[rRbBuUfF]{0,2}(?:'(?:\\.|[^\\'\n])*'?|"(?:\\.|[^\\"\n])*"?)/y;
const PY_NUMBER = /(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?j?)/y;
const PY_IDENT = /[A-Za-z_]\w*/y;
const PY_DECORATOR = /@[A-Za-z_][\w.]*/y;
const PY_CALL_AFTER = /\s*\(/y;

function scanPython(src: string, emit: Emit) {
    let i = 0;
    let prev = '';
    while (i < src.length) {
        let m: string | null;
        if ((m = at(WS, src, i)) || (m = at(NEWLINE, src, i))) {
            emit(m);
            i += m.length;
            continue;
        }
        if ((m = at(PY_COMMENT, src, i))) {
            emit(m, 'comment');
        } else if ((m = at(PY_TRIPLE, src, i)) || (m = at(PY_STRING, src, i))) {
            // An identifier like `f` or `rb` is only a prefix when a quote follows.
            if (/^[A-Za-z]+$/.test(m)) {
                emit(m);
            } else emit(m, 'string');
            prev = '"';
        } else if ((m = at(PY_DECORATOR, src, i))) {
            emit(m, 'function');
            prev = '@';
        } else if ((m = at(PY_IDENT, src, i))) {
            let kind: TokenKind | undefined;
            if (PY_CONSTANTS.has(m)) kind = 'number';
            else if (prev !== '.' && PY_KEYWORDS.has(m)) kind = 'keyword';
            else if (prev === 'def' || at(PY_CALL_AFTER, src, i + m.length) !== null) kind = 'function';
            else if (prev === 'class' || /^[A-Z][a-z]/.test(m) || PY_TYPES.has(m)) kind = 'type';
            else if (isConstant(m)) kind = 'number';
            emit(m, kind);
            prev = kind === 'keyword' ? m : 'id';
        } else if ((m = at(PY_NUMBER, src, i))) {
            emit(m, 'number');
            prev = '0';
        } else {
            m = src[i]!;
            emit(m);
            prev = m;
        }
        i += m.length;
    }
}

/* ── YAML ────────────────────────────────────────────────────────────── */

const YAML_KEY = /[ \t]*(?:- )?[\w.$/-]+(?=[ \t]*:(?:\s|$))/y;
const YAML_VALUE_WORD = /(?:true|false|null|yes|no|~|-?\d+(?:\.\d+)?)(?=\s*(?:#|$))/y;

function scanYaml(src: string, emit: Emit) {
    let i = 0;
    let lineStart = true;
    while (i < src.length) {
        let m: string | null;
        if ((m = at(NEWLINE, src, i))) {
            emit(m);
            i += m.length;
            lineStart = true;
            continue;
        }
        if (lineStart && (m = at(YAML_KEY, src, i))) {
            const dash = m.match(/^([ \t]*(?:- )?)/)![1]!;
            emit(dash);
            emit(m.slice(dash.length), 'property');
            i += m.length;
            lineStart = false;
            continue;
        }
        lineStart = false;
        if ((m = at(SH_COMMENT, src, i)) && (i === 0 || /\s/.test(src[i - 1]!))) emit(m, 'comment');
        else if ((m = at(SH_SINGLE, src, i)) || (m = at(JSON_STRING, src, i))) emit(m, 'string');
        else if ((m = at(YAML_VALUE_WORD, src, i))) emit(m, 'number');
        else if ((m = at(SH_URL, src, i))) emit(m, 'url');
        else {
            m = src[i]!;
            emit(m);
        }
        i += m.length;
    }
}

/* ── Lines ───────────────────────────────────────────────────────────── */

/** Split tokens into lines; a token that spans lines (a block comment) is cut at each break. */
function toLines(tokens: Token[]): CodeLine[] {
    const lines: CodeLine[] = [[]];
    for (const t of tokens) {
        const parts = t.text.split(/\r?\n/);
        parts.forEach((part, j) => {
            if (j > 0) lines.push([]);
            if (part) lines[lines.length - 1]!.push(t.kind ? { text: part, kind: t.kind } : { text: part });
        });
    }
    return lines;
}

/**
 * Highlight `code` written in `lang` (a fence name: ts, json, bash…). Returns
 * one array of tokens per line. An unknown language comes back as plain text.
 */
export function highlight(code: string, lang?: string | null): CodeLine[] {
    // A trailing newline (every fence has one) is not an extra empty line.
    const src = code.replace(/\r?\n$/, '');
    const grammar = grammarOf(lang);
    const { emit, tokens } = collector();
    const name = (lang ?? '').toLowerCase();
    switch (grammar) {
        case 'js':
            scanJs(src, emit, name === 'tsx' || name === 'jsx');
            break;
        case 'json':
            scanJson(src, emit);
            break;
        case 'shell':
            scanShell(src, emit);
            break;
        case 'python':
            scanPython(src, emit);
            break;
        case 'yaml':
            scanYaml(src, emit);
            break;
        default:
            emit(src);
    }
    return toLines(tokens);
}

/* ── Line marks: highlight, diff ─────────────────────────────────────── */

export type DiffMark = 'add' | 'remove';

export interface LineMarks {
    /** 1-based line numbers to mark as highlighted. */
    highlight?: ReadonlySet<number>;
    /** 1-based line numbers added or removed. */
    diff?: ReadonlyMap<number, DiffMark>;
}

/**
 * Read `+` and `-` at the start of each line as a diff, and return the code
 * without them and the marks. A line that starts with neither is context; a
 * single leading space (as `git diff` writes context) is dropped too.
 */
export function readDiff(code: string): { code: string; diff: Map<number, DiffMark> } {
    const diff = new Map<number, DiffMark>();
    const lines = code.replace(/\r?\n$/, '').split(/\r?\n/);
    const out = lines.map((line, i) => {
        const c = line[0];
        if (c === '+' || c === '-') {
            diff.set(i + 1, c === '+' ? 'add' : 'remove');
            return line.slice(1);
        }
        return c === ' ' ? line.slice(1) : line;
    });
    return { code: out.join('\n'), diff };
}

/** "1,3-5" → {1, 3, 4, 5}. Out-of-order and repeated parts are fine. */
export function parseLineRanges(spec: string | readonly number[] | undefined | null): Set<number> {
    if (!spec) return new Set();
    if (typeof spec !== 'string') return new Set(spec);
    const out = new Set<number>();
    for (const part of spec.split(',')) {
        const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!m) continue;
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        for (let n = Math.min(a, b); n <= Math.max(a, b) && n - a < 10_000; n++) out.add(n);
    }
    return out;
}

/** What a fence's meta string says: ```ts title="gate.ts" {2,4} diff showLineNumbers */
export interface CodeMeta {
    title?: string;
    highlight?: string;
    diff?: boolean;
    lineNumbers?: boolean;
    /** A diagram's drawn size, `size=834x623`. */
    size?: string;
}

export function parseCodeMeta(meta?: string | null): CodeMeta {
    if (!meta) return {};
    const out: CodeMeta = {};
    const title = meta.match(/(?:title|filename)=(?:"([^"]*)"|'([^']*)'|(\S+))/);
    if (title) out.title = title[1] ?? title[2] ?? title[3];
    const lines = meta.match(/\{([\d,\s-]+)\}/);
    if (lines) out.highlight = lines[1]!.replace(/\s+/g, '');
    const rest = meta.replace(/(?:title|filename)=(?:"[^"]*"|'[^']*'|\S+)/, '');
    if (/\bdiff\b/.test(rest)) out.diff = true;
    if (/\b(?:showLineNumbers|lineNumbers|numbers)\b/.test(rest)) out.lineNumbers = true;
    const size = meta.match(/\bsize=(\d+x\d+)\b/);
    if (size) out.size = size[1];
    return out;
}

/* ── HTML ────────────────────────────────────────────────────────────── */

const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export function escapeHtml(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ESCAPE[c]!);
}

/**
 * Lines as markup for CodeBlock's `html`: one `<span data-line>` per line
 * (with `data-mark` or `data-diff` where marked), tokens as classed spans,
 * lines joined by newlines so selecting and copying keeps them.
 */
export function linesToHtml(lines: CodeLine[], marks: LineMarks = {}): string {
    return lines
        .map((line, i) => {
            const n = i + 1;
            const attrs = [
                'data-line=""',
                marks.highlight?.has(n) ? 'data-mark=""' : '',
                marks.diff?.has(n) ? `data-diff="${marks.diff.get(n)}"` : '',
            ]
                .filter(Boolean)
                .join(' ');
            const body = line
                .map((t) => (t.kind ? `<span class="${TOKEN_CLASS[t.kind]}">${escapeHtml(t.text)}</span>` : escapeHtml(t.text)))
                .join('');
            return `<span ${attrs}>${body}</span>`;
        })
        .join('\n');
}

/** Highlight and render in one step, reading `diff` and line ranges as CodeBlock does. */
export function highlightToHtml(
    code: string,
    lang?: string | null,
    opts: { highlight?: string | readonly number[]; diff?: boolean } = {}
): string {
    const d = opts.diff ? readDiff(code) : null;
    return linesToHtml(highlight(d ? d.code : code, lang), {
        highlight: parseLineRanges(opts.highlight),
        diff: d?.diff,
    });
}
