import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { Docs } from './docs.js';
import { VERSION } from './http.js';
import { createServer } from './server.js';

const arg = process.argv[2];
if (arg === '--version' || arg === '-v') {
    process.stdout.write(`${VERSION}\n`);
    process.exit(0);
}
if (arg === '--help' || arg === '-h') {
    process.stdout.write(
        [
            `orangecheck-mcp ${VERSION}: the orangecheck MCP server, over stdio.`,
            '',
            'An MCP client starts it; it is not run by hand. For example:',
            '  claude mcp add orangecheck -- npx -y @orangecheck/mcp',
            '',
            'Docs: https://ochk.io/docs/integration/mcp',
            '',
        ].join('\n')
    );
    process.exit(0);
}

// One docs cache for the process: every connection reads llms-full.txt once a while, not once per call.
const docs = new Docs({ fetch: (input, init) => fetch(input, init) });

serveStdio(() => createServer({ docs }), {
    onerror: (err) => process.stderr.write(`orangecheck-mcp: ${err.message}\n`),
});
