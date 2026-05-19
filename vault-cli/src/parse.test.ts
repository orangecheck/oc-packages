import { describe, expect, it } from 'vitest';

import { parseEnvFile, scanRefs } from './config';

describe('parseEnvFile', () => {
    it('parses KEY=value, skipping blanks and comments', () => {
        const env = parseEnvFile(
            ['# a comment', '', 'DB=ocv://personal/pg/url', "KEY='ocv://personal/k/v'"].join('\n')
        );
        expect(env).toEqual({
            DB: 'ocv://personal/pg/url',
            KEY: 'ocv://personal/k/v',
        });
    });

    it('strips matching quotes', () => {
        expect(parseEnvFile('A="x"').A).toBe('x');
    });
});

describe('scanRefs', () => {
    it('finds every ocv:// reference in a template', () => {
        const refs = scanRefs('url: ocv://personal/pg/url\nkey: "ocv://personal/api/key"\n');
        expect(refs).toEqual(['ocv://personal/pg/url', 'ocv://personal/api/key']);
    });

    it('returns nothing when there are no references', () => {
        expect(scanRefs('plain config, no secrets')).toEqual([]);
    });
});
