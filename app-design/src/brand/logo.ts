/*
 * The two logos and the switch between them. Every place the package draws the
 * brand renders both, the default marked; CSS (theme.css) shows one. Which one
 * is the attribute on <html>, set before paint by `logoScript()` from the URL
 * or the cookie, so the server's HTML and the browser's first render are the
 * same and nothing flashes.
 *
 *   ?logo=pixel     this browser sees the pixel logo, on every *.ochk.io site
 *   ?logo=classic   back to the default (the cookie is cleared)
 *
 * The cookie is set for .ochk.io, so one visit switches the family; ochk.app
 * and any other host keep their own.
 */

export const LOGOS = ['classic', 'pixel'] as const;
export type Logo = (typeof LOGOS)[number];

/** What a page shows when nobody has chosen. Making pixel the default is this line. */
export const LOGO_DEFAULT: Logo = 'classic';

/** The cookie that holds a choice other than the default. */
export const LOGO_COOKIE = 'oc_logo';

/** The attributes a logo's element carries: its name, and a mark when it is the default. */
export function logoAttrs(logo: Logo): { 'data-oca-logo': Logo; 'data-oca-logo-default'?: '' } {
    return logo === LOGO_DEFAULT ? { 'data-oca-logo': logo, 'data-oca-logo-default': '' } : { 'data-oca-logo': logo };
}

/**
 * The script that picks the logo, for the document's head: `?logo=` sets the
 * cookie (a year; the default clears it), then the choice goes on <html> as
 * data-oc-logo. With no choice the attribute stays off and the default shows.
 */
export function logoScript(): string {
    const names = LOGOS.join('|');
    return (
        `(function(){try{var d=document.documentElement,v,` +
        `q=/[?&]logo=(${names})(?:&|$)/.exec(location.search),` +
        `s=';path=/;samesite=lax'+(location.protocol==='https:'?';secure':'')+(/(^|\\.)ochk\\.io$/.test(location.hostname)?';domain=.ochk.io':'');` +
        `if(q){v=q[1];document.cookie='${LOGO_COOKIE}='+(v==='${LOGO_DEFAULT}'?';max-age=0':v+';max-age=31536000')+s}` +
        `else{var m=/(?:^|;\\s*)${LOGO_COOKIE}=(${names})(?:;|$)/.exec(document.cookie);v=m&&m[1]}` +
        `if(v)d.setAttribute('data-oc-logo',v)}catch(e){}})();`
    );
}
