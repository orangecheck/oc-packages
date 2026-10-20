#!/usr/bin/env node
import { writeSitemap } from './sitemap/index';

const USAGE = 'usage: oc-site-kit sitemap --site https://<host> [--exclude /path ...]';

function main(argv: string[]): number {
    const [command, ...rest] = argv;
    if (command !== 'sitemap') {
        console.error(USAGE);
        return 2;
    }
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

process.exitCode = main(process.argv.slice(2));
