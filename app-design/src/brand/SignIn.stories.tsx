import type { Meta, StoryObj } from '@storybook/react';
import type { CSSProperties } from 'react';

import { OrangecheckMark } from '@orangecheck/mark/react';
import { SignInWithOrangecheck } from '@orangecheck/me-client/react';

import '@orangecheck/me-client/button.css';

/*
 * The "Sign in with orangecheck" button integrators put on their own sites
 * (@orangecheck/me-client/react, and /button for any page). It takes the
 * site's class and draws nothing of its own; the mark is @orangecheck/mark's.
 * Rules: ochk.io/docs/integration/sign-in-button.
 */
const meta: Meta = { title: 'Sign-in button' };
export default meta;

const HOSTS = `
[data-host] { border-radius: 14px; padding: 20px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
[data-host='ledger'] { background: #fbfaf7; color: #1c1917; border: 1px solid #e7e5e4; }
[data-host='ledger'] .host-btn { font: 640 16px/1.2 system-ui, sans-serif; color: #1c1917; background: transparent; border: 1px solid #d6d3d1; border-radius: 10px; padding: 9px 20px; min-height: 44px; }
[data-host='ledger'] .host-btn.solid { background: #1c1917; color: #fafaf9; border-color: #1c1917; }
:is(.dark *) [data-host='ledger'] { background: #1c1917; color: #fafaf9; border-color: #292524; }
:is(.dark *) [data-host='ledger'] .host-btn { color: #fafaf9; border-color: #44403c; }
:is(.dark *) [data-host='ledger'] .host-btn.solid { background: #fafaf9; color: #1c1917; }
[data-host='studio'] { background: #ffffff; color: #18181b; border: 1px solid #e4e4e7; }
[data-host='studio'] .host-btn { font: 500 14px/1 Inter, system-ui, sans-serif; color: #18181b; background: #ffffff; border: 1px solid #d4d4d8; border-radius: 2px; padding: 0 14px; min-height: 44px; }
[data-host='studio'] .host-btn:focus-visible { outline: 2px solid #0e9fb3; outline-offset: 1px; }
[data-host='studio'] .host-btn.solid { background: #0e9fb3; color: #ffffff; border-color: #0e9fb3; }
:is(.dark *) [data-host='studio'] { background: #09090b; color: #fafafa; border-color: #27272a; }
:is(.dark *) [data-host='studio'] .host-btn { color: #fafafa; background: #09090b; border-color: #3f3f46; }
:is(.dark *) [data-host='studio'] .host-btn.solid { background: #22c8dd; color: #09090b; }
[data-host='lantern'] { background: #fff8ec; color: #2b1d05; border: 1px solid #f3dfb8; }
[data-host='lantern'] .host-btn { font: 600 15px/1.2 Inter, system-ui, sans-serif; color: #2b1d05; background: #f2b04a; border: 0; border-radius: 11px; padding: 12px 18px; min-height: 46px; }
[data-host='lantern'] .host-btn.quiet { background: transparent; box-shadow: inset 0 0 0 1px #e8c27a; }
:is(.dark *) [data-host='lantern'] { background: #17120a; color: #f8ecd6; border-color: #3a2c12; }
:is(.dark *) [data-host='lantern'] .host-btn.quiet { color: #f8ecd6; box-shadow: inset 0 0 0 1px #6b5023; }
[data-host] .host-btn.host-icon { padding: 0; min-width: 44px; }
[data-host='lantern'] .host-btn.host-icon { min-width: 46px; }
`;

const signedIn = () => {};

export const InTheHostsStyle: StoryObj = {
    name: "In the host's style",
    render: () => (
        <div className="grid gap-4">
            <style>{HOSTS}</style>
            <div data-host="ledger">
                <button type="button" className="host-btn solid">
                    Email me a code
                </button>
                <SignInWithOrangecheck className="host-btn" onSignedIn={signedIn} />
                <SignInWithOrangecheck className="host-btn host-icon" label={false} onSignedIn={signedIn} />
            </div>
            <div data-host="studio">
                <button type="button" className="host-btn solid">
                    Continuer avec un e-mail
                </button>
                <SignInWithOrangecheck className="host-btn" label="Se connecter avec orangecheck" busyLabel="Connexion…" onSignedIn={signedIn} />
                <SignInWithOrangecheck className="host-btn host-icon" label={false} accessibleLabel="Se connecter avec orangecheck" onSignedIn={signedIn} />
            </div>
            <div data-host="lantern">
                <SignInWithOrangecheck className="host-btn" label="Continue with orangecheck" onSignedIn={signedIn} />
                <SignInWithOrangecheck className="host-btn host-icon" label={false} onSignedIn={signedIn} />
                <button type="button" className="host-btn quiet">
                    Use email instead
                </button>
            </div>
        </div>
    ),
};

export const Brand: StoryObj = {
    name: "orangecheck's own",
    render: () => (
        <div className="flex flex-wrap items-center gap-4">
            <SignInWithOrangecheck appearance="brand" mark="brand" onSignedIn={signedIn} />
            <span style={{ '--oc-button-bg': '#1d2a44', '--oc-button-hover-bg': '#2a3a5c', '--oc-button-border': '#1d2a44', '--oc-button-radius': '999px' } as CSSProperties}>
                <SignInWithOrangecheck appearance="brand" mark="brand" label="Sign up with orangecheck" onSignedIn={signedIn} />
            </span>
            <SignInWithOrangecheck appearance="brand" mark="brand" disabled onSignedIn={signedIn} />
        </div>
    ),
};

export const Marks: StoryObj = {
    name: 'The mark',
    render: () => (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
                { variant: 'mono', ground: '#ffffff', ink: '#18181b', label: 'mono on light' },
                { variant: 'mono', ground: '#0a0a0a', ink: '#fafafa', label: 'mono on dark' },
                { variant: 'brand', ground: '#0a0a0a', ink: '#fafafa', label: 'brand, dark only' },
                { variant: 'tile', ground: '#ffffff', ink: '#18181b', label: 'tile, any ground' },
            ].map(({ variant, ground, ink, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 rounded-xl border border-oca-hairline p-4 text-xs" style={{ background: ground, color: ink }}>
                    <OrangecheckMark variant={variant as 'mono' | 'brand' | 'tile'} size={variant === 'tile' ? '40px' : '48px'} title="orangecheck" />
                    {label}
                </div>
            ))}
            <div className="col-span-full flex flex-wrap items-end gap-6 text-sm">
                {[16, 24, 32, 48].map((px) => (
                    <span key={px} className="flex flex-col items-center gap-1">
                        <OrangecheckMark size={`${px}px`} />
                        {px}px
                    </span>
                ))}
            </div>
        </div>
    ),
};
