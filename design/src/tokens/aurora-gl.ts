/**
 * aurora-gl — the OcAuroraGL scene (aurora depth, release 2).
 *
 * One fullscreen WebGL2 fragment shader that supersedes the *perceptual output*
 * of the 5-blob CSS aurora: three octaves of noise through one domain-warp
 * stage, ramped through the same --au-* palette slots, with the exact mode
 * duality from aurora.css (tint in light, additive-leaning in dark), a
 * skin-keyed finish (silk under ember, device-pixel 8×8 Bayer under the four
 * cypherpunk skins), and a one-line IGN dither so dark mode never bands.
 *
 * This module is ONLY ever reached via dynamic import() from <OcAurora gl/>
 * after every gate passes — it costs consumers zero bytes otherwise. Every
 * failure path here disposes silently and the CSS blobs (never unmounted)
 * resume. No console output on any path: verify-stories.mjs fails the package
 * on any console error under headless SwiftShader.
 */

import {
    normalizeHue,
    readOcSceneTokens,
    subscribeOcTheme,
    type OcSceneRGB,
    type OcSceneTokens,
} from './scene-tokens';

const KILL_KEY = 'oc-aurora-gl-kill:1';
const KILL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // hardware doesn't change per-session
const SETTLE_MS = 90_000; // freeze uTime after this long without input
const FRAME_MS = 33; // 30fps ambient cap
const CROSSFADE_MS = 250; // palette tween — synced with the UI token snap, never lagging it

const VS = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;uniform float uT,uIsDark,uFinish,uMix;
uniform vec3 uA0,uA1,uA2,uA3,uB0,uB1,uB2,uB3,uBg;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.55;for(int i=0;i<3;i++){v+=a*n2(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
float B2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
// OKLab mix (Ottosson) so skin crossfades never transit gray-brown.
vec3 l2s(vec3 c){return mix(12.92*c,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
vec3 s2l(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
vec3 okmix(vec3 a,vec3 b,float t){
vec3 la=s2l(a),lb=s2l(b);
mat3 M1=mat3(.4122214708,.2119034982,.0883024619,.5363325363,.6806995451,.2817188376,.0514459929,.1073969566,.6299787005);
mat3 M2=mat3(4.0767416621,-1.2684380046,-.0041960863,-3.3077115913,2.6097574011,-.7034186147,.2309699292,-.3413193965,1.707614701);
vec3 ka=pow(M1*la,vec3(1./3.)),kb=pow(M1*lb,vec3(1./3.));
vec3 k=mix(ka,kb,t);return clamp(l2s(M2*(k*k*k)),0.,1.);}
void main(){
vec2 uv=gl_FragCoord.xy/uRes;
vec2 p=(uv-.5)*vec2(uRes.x/uRes.y,1.)*1.9;
float t=uT*.018;
vec2 w=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,1.3)-t*.7));
float f=fbm(p+1.9*w+vec2(t*.5,-t*.3));
float g=fbm(p*.6+w*1.2+vec2(9.1,3.7));
vec3 c0=okmix(uA0,uB0,uMix),c1=okmix(uA1,uB1,uMix),c2=okmix(uA2,uB2,uMix),c3=okmix(uA3,uB3,uMix);
vec3 c=mix(mix(c0,c1,smoothstep(.25,.55,g)),mix(c2,c3,smoothstep(.45,.8,g)),smoothstep(.4,.7,g));
float e=smoothstep(.32,.9,f);
if(uFinish>.5){
float b=B2(.125*gl_FragCoord.xy)*.0625+B2(.25*gl_FragCoord.xy)*.25+B2(.5*gl_FragCoord.xy);
e=floor(e*5.+b*.8-.4)/5.;}
// container CSS already applies the mode-op × intensity opacity + radial mask
vec3 col=(uIsDark>.5)?clamp(uBg+c*e*1.15,0.,1.):mix(uBg,c,e);
col+=(fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))))-.5)/255.;
o=vec4(col,1.);}`;

interface Palette {
    hues: [OcSceneRGB, OcSceneRGB, OcSceneRGB, OcSceneRGB];
    bg: OcSceneRGB;
    isDark: boolean;
    finish: number;
}

function killFlagged(): boolean {
    try {
        const raw = localStorage.getItem(KILL_KEY);
        if (!raw) return false;
        if (Date.now() - Number(raw) > KILL_TTL_MS) {
            localStorage.removeItem(KILL_KEY);
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

function setKillFlag(): void {
    try {
        localStorage.setItem(KILL_KEY, String(Date.now()));
    } catch {
        /* private mode — per-session demotion only */
    }
}

function cypherFinish(): boolean {
    const skin = document.documentElement.getAttribute('data-oc-theme');
    return skin !== null && skin !== 'ember';
}

function samplePalette(host: HTMLElement): Palette | null {
    const tokens: OcSceneTokens | null = readOcSceneTokens(host);
    if (!tokens) return null;
    return {
        hues: tokens.palette.map((h) => normalizeHue(h, tokens.isDark)) as Palette['hues'],
        bg: tokens.background,
        isDark: tokens.isDark,
        finish: cypherFinish() ? 1 : 0,
    };
}

/**
 * Mount the GL layer inside the `.oc-aurora` container. Returns a dispose
 * function, or null when the environment declines (no WebGL2, software
 * renderer, kill flag, token parse failure) — in which case nothing was
 * touched and the CSS blobs simply continue.
 */
export function mountAuroraGL(container: HTMLElement): (() => void) | null {
    if (killFlagged()) return null;
    if (getComputedStyle(container).getPropertyValue('--oc-aurora-gl').trim() === 'off') {
        return null; // per-site one-line kill switch, no package release needed
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'oc-aurora__gl';
    const glMaybe = canvas.getContext('webgl2', {
        antialias: false,
        depth: false,
        stencil: false,
        alpha: false,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: true, // SwiftShader/blocklist → CSS floor, free
    });
    if (!glMaybe) return null;
    const gl = glMaybe;

    const first = samplePalette(container);
    if (!first) return null;

    let prog: WebGLProgram;
    const uni: Record<string, WebGLUniformLocation | null> = {};
    try {
        const compile = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('compile');
            return s;
        };
        prog = gl.createProgram()!;
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const k of ['uRes', 'uT', 'uIsDark', 'uFinish', 'uMix', 'uA0', 'uA1', 'uA2', 'uA3', 'uB0', 'uB1', 'uB2', 'uB3', 'uBg']) {
            uni[k] = gl.getUniformLocation(prog, k);
        }
    } catch {
        return null;
    }

    container.appendChild(canvas);

    // ---- palette crossfade state (from → to over CROSSFADE_MS, mixed in OKLab in-shader)
    let palFrom = first;
    let palTo = first;
    let mixStart = 0;

    // ---- clock: pausable, settle-to-static, resume without a jump
    let raf = 0;
    let lastFrame = 0;
    let clock = 0; // accumulated scene seconds
    let lastTick = 0;
    let lastInput = performance.now();
    let live = false;
    let disposed = false;

    // ---- lightweight governor: sustained slow frames → kill flag + dispose
    let slowStreak = 0;

    const setVec = (k: string, c: OcSceneRGB) => gl.uniform3f(uni[k] ?? null, c.r, c.g, c.b);

    function resize() {
        const coarse = matchMedia('(pointer: coarse)').matches;
        const dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2) * 0.75;
        const w = Math.max(1, Math.round(container.clientWidth * dpr));
        const hgt = Math.max(1, Math.round(container.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== hgt) {
            canvas.width = w;
            canvas.height = hgt;
            gl.viewport(0, 0, w, hgt);
        }
    }

    function draw(now: number) {
        raf = requestAnimationFrame(draw);
        if (now - lastFrame < FRAME_MS) return;
        const frameGap = now - lastFrame;
        lastFrame = now;
        // governor: 3s of frames arriving at >2× budget on a capped loop = jank
        if (frameGap > FRAME_MS * 2.5) {
            if (++slowStreak > 90) {
                setKillFlag();
                dispose();
                return;
            }
        } else if (slowStreak > 0) slowStreak--;

        const settled = now - lastInput > SETTLE_MS;
        if (!settled) {
            clock += Math.min(now - lastTick, 100) / 1000; // clamp resume delta — no leap
        }
        lastTick = now;
        if (settled && live && mixDone(now)) return; // frozen frame — skip the GPU submit

        resize();
        const mix = Math.min(1, (now - mixStart) / CROSSFADE_MS);
        gl.uniform2f(uni.uRes ?? null, canvas.width, canvas.height);
        gl.uniform1f(uni.uT ?? null, clock);
        gl.uniform1f(uni.uIsDark ?? null, palTo.isDark ? 1 : 0);
        gl.uniform1f(uni.uFinish ?? null, palTo.finish);
        gl.uniform1f(uni.uMix ?? null, mix);
        setVec('uA0', palFrom.hues[0]);
        setVec('uA1', palFrom.hues[1]);
        setVec('uA2', palFrom.hues[2]);
        setVec('uA3', palFrom.hues[3]);
        setVec('uB0', palTo.hues[0]);
        setVec('uB1', palTo.hues[1]);
        setVec('uB2', palTo.hues[2]);
        setVec('uB3', palTo.hues[3]);
        setVec('uBg', palTo.bg);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (!live) {
            live = true;
            container.classList.add('oc-aurora--gl-live'); // true handoff: blobs pause+hide
        }
    }

    function mixDone(now: number): boolean {
        return now - mixStart >= CROSSFADE_MS;
    }

    const onInput = () => {
        lastInput = performance.now();
    };
    const onVisibility = () => {
        if (document.hidden) {
            cancelAnimationFrame(raf);
            raf = 0;
        } else if (!raf && !disposed) {
            lastFrame = 0;
            lastTick = performance.now();
            raf = requestAnimationFrame(draw);
        }
    };
    const onContextLost = (e: Event) => {
        e.preventDefault();
        cancelAnimationFrame(raf);
        raf = 0;
    };
    const onContextRestored = () => {
        // one restore attempt is the browser re-providing the context; if the
        // program state is gone we dispose rather than rebuild — CSS floor wins.
        dispose();
    };

    const unsubscribeTheme = subscribeOcTheme(() => {
        if (disposed) return;
        const root = document.documentElement;
        if (root.getAttribute('data-oc-motion') === 'off') {
            dispose(); // pause mechanism: GL leaves, frozen CSS blobs return
            return;
        }
        const next = samplePalette(container);
        if (!next) return; // parse hiccup — keep the current palette
        palFrom = { ...palTo, hues: [...palTo.hues] as Palette['hues'] };
        palTo = next;
        mixStart = performance.now();
        lastInput = performance.now(); // wake from settle so the fade renders
    });

    window.addEventListener('pointermove', onInput, { passive: true });
    window.addEventListener('scroll', onInput, { passive: true });
    window.addEventListener('keydown', onInput, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    function dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        unsubscribeTheme();
        window.removeEventListener('pointermove', onInput);
        window.removeEventListener('scroll', onInput);
        window.removeEventListener('keydown', onInput);
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
        container.classList.remove('oc-aurora--gl-live');
        canvas.remove();
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
    }

    resize();
    mixStart = performance.now();
    lastTick = performance.now();
    raf = requestAnimationFrame(draw);
    return dispose;
}
