/**
 * @vitest-environment jsdom
 *
 * The address field offers the signed-in account's own address. Consumer
 * sites answer /api/auth/me with `primary_btc: null` (they verify the
 * session locally and the JWT carries no primary address), but a wallet
 * sign-in shows its address as the display identity, so that is offered.
 */

import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OcAddressInput, useOcAddressSuggestion } from '../components';
import { OcSessionProvider, useOcSession } from '../provider';

const ADDR = 'bc1qvvrdxujyrh78jtnesw22cv2akfzwmvr89zkvnt';

function account(over: Record<string, unknown>) {
    return { id: 'acc-a', did_oc: 'did:oc:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', primary_btc: null, ...over };
}

function serve(acc: Record<string, unknown> | null) {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) =>
        String(url).endsWith('/api/auth/me')
            ? new Response(JSON.stringify({ ok: true, account: acc }), {
                  headers: { 'Content-Type': 'application/json' },
              })
            : new Response('{}', { status: 404 })
    ) as unknown as typeof fetch;
}

function HookField() {
    const [value, setValue] = React.useState('');
    const { status } = useOcSession();
    const { inputProps, popover } = useOcAddressSuggestion({ value, onValueChange: setValue });
    return (
        <div data-status={status}>
            <input aria-label="address" value={value} onChange={(e) => setValue(e.target.value)} {...inputProps} />
            {popover}
        </div>
    );
}

function InputField() {
    const [value, setValue] = React.useState('');
    const { status } = useOcSession();
    return (
        <div data-status={status}>
            <OcAddressInput aria-label="address" value={value} onValueChange={setValue} />
        </div>
    );
}

async function focusedOptions(Field: () => React.ReactElement) {
    const { container } = render(
        <OcSessionProvider>
            <Field />
        </OcSessionProvider>
    );
    await waitFor(() =>
        expect(container.querySelector('[data-status="authenticated"], [data-status="anonymous"]')).not.toBeNull()
    );
    fireEvent.focus(screen.getByLabelText('address'));
    return screen.queryAllByRole('option').map((o) => o.textContent ?? '');
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe.each([
    ['useOcAddressSuggestion', HookField],
    ['OcAddressInput', InputField],
])('%s offers the account address', (_name, Field) => {
    it('from a wallet display identity when primary_btc is null', async () => {
        serve(account({ display_identity: { kind: 'btc', value: ADDR } }));
        const options = await focusedOptions(Field);
        expect(options.join(' ')).toContain(ADDR.slice(0, 6));
        fireEvent.click(screen.getByRole('option'));
        expect((screen.getByLabelText('address') as HTMLInputElement).value).toBe(ADDR);
    });

    it('from primary_btc when the host sends one', async () => {
        serve(account({ primary_btc: ADDR, display_identity: { kind: 'email', value: 'a@example.com' } }));
        expect((await focusedOptions(Field)).join(' ')).toContain(ADDR.slice(0, 6));
    });

    it('nothing when the account shows an email and has no primary address', async () => {
        serve(account({ display_identity: { kind: 'email', value: 'a@example.com' } }));
        expect(await focusedOptions(Field)).toEqual([]);
    });

    it('nothing when signed out', async () => {
        serve(null);
        expect(await focusedOptions(Field)).toEqual([]);
    });
});
