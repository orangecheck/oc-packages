#!/usr/bin/env node
import { cspCheck } from './csp/check';
import { writeSitemap } from './sitemap/index';

const USAGE = [
    'usage: oc-site-kit sitemap --site https://<host> [--exclude /path ...]',
    '       oc-site-kit csp-check [--min-pages <n>] [--base http://127.0.0.1:<port>]',
].join('\n');

function sitemap(rest: string[]): number {
    let siteUrl: string | undefined;
    const exclude: string[] = [];
    for (let i = 0; i < rest.length; i++) {
        const flag = rest[i];
        const value = rest[i + 1];
        if ((flag === '--site' || flag === '--exclude') && value !== undefined) {
            if (flag === '--site') siteUrl = value;
            else exclude.push(value);
            i++;
        } else {
            console.error(`unknown or incomplete argument: ${flag}\n${USAGE}`);
            return 2;
        }
    }
    if (!siteUrl) {
        console.error(USAGE);
        return 2;
    }
    const n = writeSitemap({ siteUrl, exclude });
    console.log(`[sitemap] wrote ${n} urls -> public/sitemap.xml`);
    return 0;
}

/** Every page of the build in the working directory against its Content-Security-Policy. */
async function cspCheckCommand(rest: string[]): Promise<number> {
    let minPages: number | undefined;
    let base: string | undefined;
    for (let i = 0; i < rest.length; i++) {
        const flag = rest[i];
        const value = rest[i + 1];
        if (flag === '--min-pages' && value !== undefined && /^\d+$/.test(value)) minPages = Number(value);
        else if (flag === '--base' && value !== undefined && /^https?:\/\/[^\s/]+$/.test(value)) base = value;
        else {
            console.error(`unknown or incomplete argument: ${flag}\n${USAGE}`);
            return 2;
        }
        i++;
    }
    try {
        return (await cspCheck({ minPages, base })).code;
    } catch (e) {
        console.error(`csp-check: ${e instanceof Error ? e.message : String(e)}`);
        return 2;
    }
}

async function main(argv: string[]): Promise<number> {
    const [command, ...rest] = argv;
    if (command === 'sitemap') return sitemap(rest);
    if (command === 'csp-check') return cspCheckCommand(rest);
    console.error(USAGE);
    return 2;
}

void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
});
