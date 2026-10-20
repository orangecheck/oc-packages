export {
    CODE_LANGS,
    escapeHtml,
    grammarOf,
    highlight,
    highlightToHtml,
    linesToHtml,
    parseCodeMeta,
    parseLineRanges,
    readDiff,
    TOKEN_CLASS,
} from './highlight';
export type { CodeLine, CodeMeta, DiffMark, LineMarks, Token, TokenKind } from './highlight';
export { rehypeCode } from './rehype';
export type { RehypeCodeOptions } from './rehype';
