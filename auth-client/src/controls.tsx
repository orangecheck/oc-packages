import * as React from 'react';

/*
 * app-design 2.0's checkbox and radio, for the ceremonies here that style
 * themselves inline: a real input (its label, keyboard and form behaviour
 * unchanged), drawn 20px from the page's tokens instead of the platform's
 * control and its accent-color. The checkbox is square; the radio is round,
 * as app-design's own is, since a square radio reads as a checkbox.
 *
 * Under forced colors the fill gives way to the system's Canvas but an SVG
 * keeps its own colour, so a checked box's white mark vanished on a white
 * Canvas. A small stylesheet draws them as native controls do there: a
 * checked checkbox in Highlight with its mark in HighlightText, a chosen
 * radio's border and dot in Highlight, the rest in CanvasText. Inline styles
 * cannot say forced-colors.
 */

type BoxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'style' | 'checked'> & { checked: boolean };

const WRAP: React.CSSProperties = { position: 'relative', display: 'inline-flex', flexShrink: 0, width: 20, height: 20 };

const FORCED = [
    '@media (forced-colors: active){',
    '[data-oc-control] input{border-color:CanvasText!important;background:Canvas!important}',
    '[data-oc-control] input[type=checkbox]:checked{border-color:Highlight!important;background:Highlight!important}',
    '[data-oc-control] input[type=radio]:checked{border-color:Highlight!important}',
    '[data-oc-control] svg[data-oc-check]{color:HighlightText!important}',
    '[data-oc-control] svg[data-oc-dot]{color:Highlight!important}',
    '[data-oc-control] input:disabled{border-color:GrayText!important}',
    '}',
].join('');

function boxStyle(kind: 'checkbox' | 'radio', checked: boolean, disabled: boolean): React.CSSProperties {
    return {
        appearance: 'none',
        WebkitAppearance: 'none',
        margin: 0,
        width: 20,
        height: 20,
        borderRadius: kind === 'radio' ? '50%' : 0,
        border: checked ? '1px solid var(--primary, #f97316)' : '1px solid var(--input, var(--border, #52525b))',
        background: checked && kind === 'checkbox' ? 'var(--primary, #f97316)' : 'var(--oca-surface, var(--background, transparent))',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
    };
}

const MARK: React.CSSProperties = { position: 'absolute', inset: 3, width: 14, height: 14, pointerEvents: 'none' };

/** The design checkbox: filled with --primary when checked, its mark in --primary-foreground. */
export function DesignCheckbox({ checked, disabled, ...props }: BoxProps) {
    return (
        <span data-oc-control="" style={WRAP}>
            <style dangerouslySetInnerHTML={{ __html: FORCED }} />
            <input {...props} type="checkbox" checked={checked} disabled={disabled} style={boxStyle('checkbox', checked, Boolean(disabled))} />
            {checked ? (
                <svg data-oc-check="" aria-hidden="true" viewBox="0 0 24 24" style={{ ...MARK, color: 'var(--primary-foreground, #ffffff)' }}>
                    <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="square" />
                </svg>
            ) : null}
        </span>
    );
}

/** The design radio: round, as app-design's RadioGroupItem is, with a dot in --primary when chosen. */
export function DesignRadio({ checked, disabled, ...props }: BoxProps) {
    return (
        <span data-oc-control="" style={WRAP}>
            <style dangerouslySetInnerHTML={{ __html: FORCED }} />
            <input {...props} type="radio" checked={checked} disabled={disabled} style={boxStyle('radio', checked, Boolean(disabled))} />
            {checked ? (
                <svg data-oc-dot="" aria-hidden="true" viewBox="0 0 14 14" style={{ ...MARK, color: 'var(--primary, #f97316)' }}>
                    <circle cx="7" cy="7" r="4" fill="currentColor" />
                </svg>
            ) : null}
        </span>
    );
}
