// check-pagination — Pagination renders the rows its zero-based pageIndex names,
// clamps a stale or 1-based index instead of skipping rows, and still honours the
// deprecated `page` prop. Runs against the built dist (CI builds before `yarn test`).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'primitives.mjs');
if (!existsSync(dist)) {
    console.error('check-pagination: build first (yarn build); dist/primitives.mjs is missing');
    process.exit(1);
}
const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { Pagination } = await import(dist);

const warns = [];
console.warn = (m) => warns.push(String(m));
const render = (props) =>
    renderToStaticMarkup(React.createElement(Pagination, { pageSize: 10, onPage: () => {}, ...props }));
const label = (html) => html.match(/>(\d+–\d+ of \d+)</)?.[1];
const disabled = (html) => [...html.matchAll(/<button([^>]*)>/g)].map((m) => /\bdisabled=""/.test(m[1]));

const fails = [];
const expect = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

expect('first page', label(render({ pageIndex: 0, total: 20 })), '1–10 of 20');
expect('first page buttons [prev, next] disabled', disabled(render({ pageIndex: 0, total: 20 })), [true, false]);
expect('second page', label(render({ pageIndex: 1, total: 20 })), '11–20 of 20');
expect('last page buttons', disabled(render({ pageIndex: 1, total: 20 })), [false, true]);
expect('fits on one page renders nothing', render({ pageIndex: 0, total: 10 }), '');

warns.length = 0;
expect('index past the end clamps to the last page', label(render({ pageIndex: 5, total: 20 })), '11–20 of 20');
expect('index past the end warns', warns.some((w) => /zero-based/.test(w)), true);

warns.length = 0;
expect('deprecated page still works', label(render({ page: 1, total: 25 })), '11–20 of 25');
expect('deprecated page warns', warns.some((w) => /deprecated/.test(w)), true);

if (fails.length) {
    console.error('check-pagination:\n  ' + fails.join('\n  '));
    process.exit(1);
}
console.log('check-pagination: ok');
